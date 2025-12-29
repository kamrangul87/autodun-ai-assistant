import type { NextApiRequest, NextApiResponse } from "next";
import { getNearbyChargers } from "@/lib/tools/evFinder";

type AgentStatus = "ok" | "needs_clarification" | "out_of_scope" | "error";
type AgentIntent =
  | "mot_preparation"
  | "ev_charging_readiness"
  | "used_car_buyer"
  | "unknown_out_of_scope";

type AgentAction = { label: string; href: string; type: "primary" | "secondary" };

type AgentResponse = {
  status: AgentStatus;
  intent: AgentIntent;
  sections: {
    understanding: string;
    analysis: string[];
    recommended_next_step: string;
  };
  actions: AgentAction[];
  meta: { request_id: string; tool_calls: Array<{ name: string; ok: boolean; ms: number }> };
};

function requestId() {
  return "agt_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Robustly read `text` from request body.
 * Supports:
 *  - { text: "..." }
 *  - "..." (raw string)
 *  - body as JSON string that contains { text: "..." }
 */
function getTextFromBody(req: NextApiRequest): string {
  const b: any = (req as any).body;

  // Case 1: already an object with text
  if (b && typeof b === "object" && typeof b.text === "string") return b.text;

  // Case 2: raw string
  if (typeof b === "string") {
    const s = b.trim();

    // if it's JSON string, try parse
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith('"') && s.endsWith('"'))) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === "object" && typeof parsed.text === "string") return parsed.text;
        if (typeof parsed === "string") return parsed;
      } catch {
        // fallthrough to raw string
      }
    }

    return s.replace(/^"(.*)"$/, "$1"); // if quoted string came through
  }

  // Case 3: unknown shape
  return "";
}

function classifyIntent(text: string): AgentIntent {
  const t = text.toLowerCase();

  const hardOOS = [
    "import",
    "japan",
    "customs",
    "duty",
    "vat",
    "dvla registration",
    "type approval",
    "shipping",
    "container",
    "auction",
    "copart",
    "insurance quote",
    "finance",
    "loan",
    "lease",
    "visa",
    "immigration",
    "job",
    "health",
    "bitcoin",
  ];
  if (hardOOS.some((k) => t.includes(k))) return "unknown_out_of_scope";

  const mot = [
    "mot",
    "fail",
    "test",
    "advisory",
    "advisories",
    "mileage",
    "miles",
    "years old",
    "emission",
    "emissions",
    "brake",
    "brakes",
    "tyre",
    "tyres",
    "suspension",
    "warning light",
    "engine light",
    "vrm",
    "registration",
  ];

  const ev = [
    "ev",
    "electric",
    "charge",
    "charging",
    "charger",
    "chargers",
    "ccs",
    "type 2",
    "chademo",
    "rapid",
    "ultra rapid",
    "kwh",
    "range",
    "charging near me",
    "near me",
    "postcode",
  ];

  const used = [
    "buy",
    "buying",
    "used car",
    "second hand",
    "purchase",
    "seller",
    "inspection",
    "checklist",
    "service history",
    "v5",
    "hpi",
    "cat s",
    "cat n",
    "write off",
  ];

  const motScore = mot.filter((k) => t.includes(k)).length;
  const evScore = ev.filter((k) => t.includes(k)).length;
  const usedScore = used.filter((k) => t.includes(k)).length;

  if (motScore === 0 && evScore === 0 && usedScore === 0) return "unknown_out_of_scope";
  if (motScore >= evScore && motScore >= usedScore) return "mot_preparation";
  if (evScore >= motScore && evScore >= usedScore) return "ev_charging_readiness";
  return "used_car_buyer";
}

function extractAgeYears(text: string): number | null {
  const m = text.toLowerCase().match(/(\d{1,2})\s*(years|year|yrs|yr)\s*old/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function extractMileage(text: string): number | null {
  const t = text.toLowerCase().replace(/,/g, "");
  const k = t.match(/(\d{2,3})\s*k\s*miles/);
  if (k) return parseInt(k[1], 10) * 1000;

  const m = t.match(/(\d{4,6})\s*miles/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

// VRM extractor (UK format, simple)
function extractVRM(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/);
  if (!m) return null;
  return m[1].replace(/\s+/g, "");
}

/**
 * UK postcode extractor (v2 - safer)
 * Matches: SW1A 1AA, M1 1AE, B33 8TH, B338TH
 */
function extractPostcode(text: string): string | null {
  const clean = text.toUpperCase().replace(/\s+/g, " ").trim();

  // common UK postcode regex (simplified but strong enough for routing)
  const m = clean.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})\b/);
  if (!m) return null;
  return `${m[1]} ${m[2]}`.trim();
}

// -----------------------
// MOT Intelligence v2 (your code kept, only small fixes)
// -----------------------

type MotDefect = {
  dangerous?: boolean;
  text?: string;
  type?: string; // ADVISORY | FAIL | MAJOR | DANGEROUS (varies)
};

type MotTest = {
  completedDate?: string;
  expiryDate?: string;
  testResult?: string; // PASSED / FAILED
  odometerValue?: string; // sometimes string
  odometerUnit?: string; // MI
  defects?: MotDefect[];
};

type MotHistory = {
  registration?: string;
  make?: string;
  model?: string;
  fuelType?: string;
  primaryColour?: string;
  firstUsedDate?: string;
  registrationDate?: string;
  motTests?: MotTest[];
};

const MOT_HISTORY_API_URL =
  process.env.MOT_PREDICTOR_API_URL || "https://mot.autodun.com/api/mot-history";

function toNum(v: any): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function yearsSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return Math.max(0, diff / (365.25 * 24 * 3600 * 1000));
}

function themeFromText(t: string): string {
  const s = (t || "").toLowerCase();
  const x = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");

  const has = (...keys: string[]) => keys.some((k) => x.includes(k));

  if (has("corrosion", "corroded", "rust", "rotted", "subframe", "chassis", "structural", "mounting"))
    return "corrosion";

  if (has("brake", "disc", "pad", "caliper", "handbrake", "parking brake", "brake pipe", "brake hose", "abs"))
    return "brakes";

  if (has("tyre", "tire", "tread", "sidewall", "bulge", "cord", "wheel", "rim", "alloy"))
    return "tyres";

  if (has("suspension", "shock", "strut", "spring", "damper", "wishbone", "control arm", "bush", "ball joint", "drop link"))
    return "suspension";

  if (has("steering", "rack", "track rod", "tie rod", "power steering", "column", "joint"))
    return "steering";

  if (has("exhaust", "silencer", "muffler", "tailpipe", "flexi", "flexible joint"))
    return "exhaust";

  if (has("emission", "smoke", "lambda", "o2 sensor", "catalyst", "dpf", "egr", "engine management", "check engine"))
    return "emissions";

  if (has("oil leak", "leak", "coolant", "brake fluid", "power steering fluid"))
    return "leaks_fluids";

  if (has("light", "lamp", "headlamp", "indicator", "fog", "wiper", "washer", "windscreen", "mirror"))
    return "lights_visibility";

  if (has("seat belt", "seatbelt", "pretensioner", "airbag", "srs"))
    return "seatbelts_srs";

  if (has("battery", "alternator", "starter", "wiring", "electrical", "warning lamp", "dashboard warning"))
    return "electrical";

  if (has("door", "bonnet", "boot", "tailgate", "latch", "hinge", "bumper", "panel"))
    return "body_structure";

  if (has("excessive play", "insecure", "loose", "movement", "worn", "deteriorated", "fractured", "cracked"))
    return "suspension";

  if (has("not operating correctly", "operation impaired", "does not operate", "malfunction", "fails to operate"))
    return "electrical";

  if (has("mounting", "bracket", "support", "carrier", "fixing", "secure", "retaining"))
    return "body_structure";

  return "other";
}

type RiskBand = "HIGH" | "MEDIUM" | "LOW";
type MotRisk = { score: number; band: RiskBand };

function scoreMotRisk(input: {
  ageYears?: number | null;
  mileage?: number | null;
  latestResult?: string | null;
  totalFails: number;
  totalAdvisories: number;
  dangerousCount: number;
  majorCount: number;
  repeatThemes: Record<string, number>;
}): MotRisk {
  let score = 20;

  if (typeof input.ageYears === "number") {
    if (input.ageYears >= 15) score += 20;
    else if (input.ageYears >= 10) score += 12;
    else if (input.ageYears >= 6) score += 6;
  }

  if (typeof input.mileage === "number") {
    if (input.mileage >= 160000) score += 18;
    else if (input.mileage >= 120000) score += 12;
    else if (input.mileage >= 80000) score += 7;
  }

  if ((input.latestResult || "").toUpperCase().includes("FAIL")) score += 18;

  score += Math.min(20, input.totalFails * 3);
  score += Math.min(15, input.totalAdvisories * 1);
  score += Math.min(25, input.dangerousCount * 10);
  score += Math.min(15, input.majorCount * 5);

  const repeats = Object.values(input.repeatThemes).filter((n) => n >= 2).length;
  score += Math.min(10, repeats * 3);

  score = Math.max(0, Math.min(100, score));
  const band: RiskBand = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";

  return { score, band };
}

function pickTopThemes(repeatThemes: Record<string, number>, topN = 3) {
  return Object.entries(repeatThemes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([k, v]) => ({ theme: k, count: v }));
}

async function tool_get_mot_intelligence_v2(vrm: string): Promise<{
  vrm: string;
  vehicle: { make?: string; model?: string; fuelType?: string; colour?: string; ageYears?: number | null };
  latest: { result?: string; completedDate?: string; expiryDate?: string; mileage?: number | null };
  counts: { fails: number; advisories: number; dangerous: number; major: number };
  topThemes: Array<{ theme: string; count: number }>;
  risk: { score: number; band: "LOW" | "MEDIUM" | "HIGH" };
  actionPlan: string[];
}> {
  const url = new URL(MOT_HISTORY_API_URL);
  url.searchParams.set("vrm", vrm);

  const r = await fetch(url.toString(), { method: "GET" });
  if (!r.ok) throw new Error(`MOT history fetch failed (${r.status})`);

  const data = (await r.json()) as MotHistory;

  const tests = Array.isArray(data?.motTests) ? data.motTests : [];
  const latest = tests[0] || {};

  const ageYears = yearsSince(data.firstUsedDate || data.registrationDate);
  const mileage = toNum(latest?.odometerValue);

  let fails = 0;
  let advisories = 0;
  let dangerous = 0;
  let major = 0;

  const themeCounts: Record<string, number> = {};

  for (const t of tests) {
    const result = (t?.testResult || "").toUpperCase();
    if (result.includes("FAIL")) fails++;

    const defects = Array.isArray(t?.defects) ? t.defects : [];
    for (const d of defects) {
      const dtype = (d?.type || "").toUpperCase();
      const txt = d?.text || "";

      if (dtype.includes("ADVISORY")) advisories++;
      if (dtype.includes("DANG")) dangerous++;
      if (dtype.includes("MAJOR")) major++;

      if (txt) {
        const theme = themeFromText(txt);
        themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      }
    }
  }

  const topThemes = pickTopThemes(themeCounts, 3);
  const latestResult = latest?.testResult || null;

  const risk = scoreMotRisk({
    ageYears,
    mileage,
    latestResult,
    totalFails: fails,
    totalAdvisories: advisories,
    dangerousCount: dangerous,
    majorCount: major,
    repeatThemes: themeCounts,
  });

  const actionPlan: string[] = [];
  for (const t of topThemes) {
    if (t.theme === "suspension") actionPlan.push("Suspension/steering: inspect bushes, arms, shocks; fix play/noise.");
    else if (t.theme === "brakes") actionPlan.push("Brakes: check pads/discs/pipes; address corrosion/leaks early.");
    else if (t.theme === "tyres") actionPlan.push("Tyres: tread/sidewall; check alignment and pressures.");
    else if (t.theme === "corrosion") actionPlan.push("Corrosion: inspect brake pipes, subframe/chassis areas; treat/replace as needed.");
    else if (t.theme === "emissions") actionPlan.push("Emissions: scan for warning lights; ensure service items and sensors are healthy.");
    else if (t.theme === "steering") actionPlan.push("Steering: inspect rack, track rods, joints; address play or leaks.");
    else if (t.theme === "exhaust") actionPlan.push("Exhaust: check for leaks or damaged mounts before emissions test.");
    else if (t.theme === "seatbelts_srs") actionPlan.push("Safety systems: check seatbelts and airbag/SRS warning lights.");
    else if (t.theme === "electrical") actionPlan.push("Electrical: resolve warning lights; check battery and alternator.");
    else if (t.theme === "body_structure") actionPlan.push("Body/structure: inspect doors, bonnet latches, and body condition.");
    else actionPlan.push(`Review repeat issue theme: ${t.theme}.`);
  }

  return {
    vrm,
    vehicle: {
      make: data?.make,
      model: data?.model,
      fuelType: data?.fuelType,
      colour: data?.primaryColour,
      ageYears,
    },
    latest: {
      result: latest?.testResult,
      completedDate: latest?.completedDate,
      expiryDate: latest?.expiryDate,
      mileage,
    },
    counts: { fails, advisories, dangerous, major },
    topThemes,
    risk,
    actionPlan: actionPlan.length ? actionPlan : ["Open MOT Predictor to review advisories and prioritise repairs."],
  };
}

async function tool_get_mot_risk_summary(input: { vehicle_age_years?: number; mileage?: number }) {
  const age = input.vehicle_age_years ?? null;
  const miles = input.mileage ?? null;

  let risk: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
  if ((age !== null && age >= 12) || (miles !== null && miles >= 120000)) risk = "HIGH";
  if (age !== null && miles !== null && age <= 4 && miles <= 40000) risk = "LOW";

  const drivers: string[] = [];
  drivers.push(
    age !== null
      ? `Vehicle age (${age} years) increases probability of wear-related advisories.`
      : `Vehicle age increases probability of wear-related advisories.`
  );
  drivers.push(
    miles !== null
      ? `Mileage (${miles.toLocaleString()} miles) correlates with wear on brakes, suspension, and tyres.`
      : `Mileage correlates with wear on brakes, suspension, and tyres.`
  );

  const checklist = [
    "Brakes: pads/discs, brake fluid, handbrake effectiveness",
    "Suspension/steering: bushes, shocks, ball joints",
    "Tyres: tread depth, sidewall damage, alignment",
    "Lights & visibility: bulbs, lenses, wipers, washer fluid",
    "Emissions readiness: warning lights, service history",
  ];

  return { risk_band: risk, drivers, checklist };
}

async function tool_get_used_car_buyer_checklist() {
  return {
    must_check: [
      "MOT history pattern: repeated advisories/fails in the same area",
      "Service evidence: key interval items where applicable",
      "Tyres/brakes/suspension condition",
      "Warning lights and (if possible) an OBD scan",
      "Corrosion / accident signs",
    ],
    red_flags: [
      "Seller avoids V5C, receipts, or clear history",
      "Mileage story does not match wear",
      "Repeated advisories with no evidence of repair",
    ],
  };
}

function oosResponse(id: string, tool_calls: AgentResponse["meta"]["tool_calls"]): AgentResponse {
  return {
    status: "out_of_scope",
    intent: "unknown_out_of_scope",
    sections: {
      understanding: "This request is outside the current Autodun AI Assistant scope.",
      analysis: [
        "Supported workflows: MOT preparation, EV charging readiness, used-car buying checks.",
        "Rephrase your request to one of these goals and I will route you correctly.",
      ],
      recommended_next_step:
        "Try: “MOT intelligence for ML58FOU” OR “chargers near SW1A 1AA” OR “I’m buying a used car — checklist”.",
    },
    actions: [
      { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
      { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: { request_id: id, tool_calls },
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = requestId();
  const tool_calls: AgentResponse["meta"]["tool_calls"] = [];

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const text = getTextFromBody(req).trim();
  if (text.length < 3 || text.length > 800) {
    const out: AgentResponse = {
      status: "needs_clarification",
      intent: "unknown_out_of_scope",
      sections: {
        understanding: "I didn’t receive a valid request.",
        analysis: [
          "Send JSON like: { \"text\": \"chargers near SW1A 1AA\" }",
          "Or: { \"text\": \"MOT intelligence for ML58FOU\" }",
        ],
        recommended_next_step: "Please resend your request in the JSON format above.",
      },
      actions: [
        { label: "Open AI Assistant", href: "/ai-assistant", type: "primary" },
        { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls },
    };
    return res.status(200).json(out);
  }

  const intent = classifyIntent(text);

  try {
    if (intent === "unknown_out_of_scope") return res.status(200).json(oosResponse(id, tool_calls));

    // ---------------- MOT ----------------
    if (intent === "mot_preparation") {
      const vrm = extractVRM(text);
      const age = extractAgeYears(text);
      const miles = extractMileage(text);

      if (vrm) {
        const tMot = Date.now();
        const intel = await tool_get_mot_intelligence_v2(vrm);
        tool_calls.push({ name: "mot_history", ok: true, ms: Date.now() - tMot });

        const latestLine = `Latest MOT: ${String(intel.latest.result || "UNKNOWN")} (${String(intel.latest.completedDate || "n/a")}).`;
        const expiryLine = intel.latest.expiryDate ? `Expiry: ${intel.latest.expiryDate}.` : "";
        const mileageLine = typeof intel.latest.mileage === "number" ? `Mileage: ${intel.latest.mileage.toLocaleString()} mi.` : "";
        const countsLine = `Counts (all tests): Advisories ${intel.counts.advisories}, Fails ${intel.counts.fails}, Major ${intel.counts.major}, Dangerous ${intel.counts.dangerous}.`;
        const themeLine = intel.topThemes.length > 0
          ? `Repeat themes: ${intel.topThemes.map((t) => `${t.theme} (${t.count})`).join(", ")}.`
          : "Repeat themes: none detected.";
        const riskLine = `Risk score: ${intel.risk.score}/100 (${intel.risk.band}).`;

        const out: AgentResponse = {
          status: "ok",
          intent,
          sections: {
            understanding: `MOT intelligence for ${vrm}.`,
            analysis: [
              latestLine,
              ...(expiryLine ? [expiryLine] : []),
              ...(mileageLine ? [mileageLine] : []),
              countsLine,
              themeLine,
              riskLine,
              "Priority action plan:",
              ...intel.actionPlan.slice(0, 5).map((x) => `• ${x}`),
            ],
            recommended_next_step: "Open MOT Predictor to view full MOT history, then fix the top repeat themes before the next test.",
          },
          actions: [
            { label: "Open MOT Predictor", href: `https://mot.autodun.com/?vrm=${encodeURIComponent(vrm)}`, type: "primary" },
            { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
          ],
          meta: { request_id: id, tool_calls },
        };
        return res.status(200).json(out);
      }

      if (age === null && miles === null) {
        const out: AgentResponse = {
          status: "needs_clarification",
          intent,
          sections: {
            understanding: "You want MOT guidance, but key details are missing.",
            analysis: ["Tell me VRM OR vehicle age + mileage to estimate risk and give a checklist."],
            recommended_next_step: "Reply with your VRM (example: ML58FOU) or say “10 years old, 85k miles”.",
          },
          actions: [
            { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
            { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
          ],
          meta: { request_id: id, tool_calls },
        };
        return res.status(200).json(out);
      }

      const t0 = Date.now();
      const mot = await tool_get_mot_risk_summary({ vehicle_age_years: age ?? undefined, mileage: miles ?? undefined });
      tool_calls.push({ name: "get_mot_risk_summary", ok: true, ms: Date.now() - t0 });

      const out: AgentResponse = {
        status: "ok",
        intent,
        sections: {
          understanding: "MOT risk view and what to check before the test.",
          analysis: [`Risk band: ${mot.risk_band}.`, ...mot.drivers, ...mot.checklist],
          recommended_next_step: "Add your VRM to get the live MOT history pattern analysis.",
        },
        actions: [
          { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: { request_id: id, tool_calls },
      };
      return res.status(200).json(out);
    }

    // ---------------- EV ----------------
    if (intent === "ev_charging_readiness") {
      const postcode = extractPostcode(text);

      if (!postcode) {
        const out: AgentResponse = {
          status: "needs_clarification",
          intent,
          sections: {
            understanding: "You want EV charging options near you.",
            analysis: [
              "To show nearby chargers, I need a UK postcode (example: SW1A 1AA).",
              "Optional: add connector preference (CCS/Type 2) and rapid-only.",
            ],
            recommended_next_step: "Reply with: “chargers near SW1A 1AA”.",
          },
          actions: [
            { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
            { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
          ],
          meta: { request_id: id, tool_calls },
        };
        return res.status(200).json(out);
      }

      const tStations = Date.now();
      const stations = await getNearbyChargers({ postcode, radiusMiles: 10, limit: 5 });
      tool_calls.push({ name: "ev_finder_stations", ok: true, ms: Date.now() - tStations });

      const lines =
        stations.length > 0
          ? [
              `Top chargers near ${postcode}:`,
              ...stations.map((s: any, i: number) => {
                const dist = typeof s?.distance_miles === "number" ? ` — ${s.distance_miles.toFixed(1)} mi` : "";
                const addr = s?.address ? ` — ${s.address}` : "";
                const con =
                  Array.isArray(s?.connectorsDetailed) && s.connectorsDetailed.length
                    ? ` — ${s.connectorsDetailed.map((c: any) => c?.type).filter(Boolean).join(", ")}`
                    : "";
                return `${i + 1}. ${s?.name || "Charging location"}${dist}${addr}${con}`;
              }),
              "Tip: Prefer sites with multiple stalls and keep a backup within 10–15 minutes.",
            ]
          : [`No stations were returned for ${postcode}.`, "Open EV Charger Finder to search on the map."];

      const out: AgentResponse = {
        status: "ok",
        intent,
        sections: {
          understanding: `EV charging options for ${postcode}.`,
          analysis: lines,
          recommended_next_step: "Open EV Charger Finder to view on map and get directions.",
        },
        actions: [
          { label: "Open EV Charger Finder", href: `https://ev.autodun.com/?postcode=${encodeURIComponent(postcode)}`, type: "primary" },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: { request_id: id, tool_calls },
      };
      return res.status(200).json(out);
    }

    // ---------------- Used car ----------------
    const t0 = Date.now();
    const used = await tool_get_used_car_buyer_checklist();
    tool_calls.push({ name: "get_used_car_buyer_checklist", ok: true, ms: Date.now() - t0 });

    const out: AgentResponse = {
      status: "ok",
      intent: "used_car_buyer",
      sections: {
        understanding: "Used-car checklist to reduce buying risk.",
        analysis: [...used.must_check, "Red flags:", ...used.red_flags.map((x) => `• ${x}`)],
        recommended_next_step: "Use MOT Predictor to review MOT history before committing.",
      },
      actions: [
        { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls },
    };
    return res.status(200).json(out);
  } catch (e: any) {
    const out: AgentResponse = {
      status: "error",
      intent,
      sections: {
        understanding: "We could not complete the analysis.",
        analysis: [
          "A temporary error occurred while running the agent.",
          `Debug hint: ${String(e?.message || e || "unknown error")}`,
        ],
        recommended_next_step: "Please try again.",
      },
      actions: [
        { label: "Open AI Assistant", href: "/ai-assistant", type: "primary" },
        { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls },
    };
    return res.status(500).json(out);
  }
}
