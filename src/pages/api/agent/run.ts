import type { NextApiRequest, NextApiResponse } from "next";

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
 * Autodun AI Assistant is a bounded, tool-routing agent.
 * It must not behave like a general-purpose chatbot.
 */
function classifyIntent(text: string): AgentIntent {
  const t = text.toLowerCase();

  // Hard out-of-scope triggers (regulatory/legal, logistics, unrelated)
  // We explicitly catch these so the agent stays "tool-bounded" and doesn't hallucinate.
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
    "registration",
    "reg",
    "vrm",
  ];

  const ev = [
    "ev",
    "electric",
    "charge",
    "charging",
    "charger",
    "ccs",
    "type 2",
    "chademo",
    "rapid",
    "ultra rapid",
    "kwh",
    "range",
    "charging near me",
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

/**
 * UK VRM extractor (simple, safe).
 * Looks for 5–8 chars containing both letters and numbers.
 * Examples: ML58FOU, AB12CDE, A1BCD
 */
function extractVRM(text: string): string | null {
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9 ]/g, " ");
  const parts = cleaned.split(/\s+/).filter(Boolean);

  for (const p of parts) {
    if (p.length >= 5 && p.length <= 8 && /[A-Z]/.test(p) && /\d/.test(p)) return p;
  }
  return null;
}

/**
 * UK postcode extractor (v1).
 * Example matches: "SW1A 1AA", "M1 1AE", "B338TH"
 */
function extractPostcode(text: string): string | null {
  const m = text
    .toUpperCase()
    .replace(/\s+/g, " ")
    .match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/);

  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

// -----------------------
// Tools (server-side)
// -----------------------

/**
 * LIVE MOT: fetch from your MOT Predictor API (which itself talks to DVSA server-side).
 *
 * ENV REQUIRED:
 *  - MOT_PREDICTOR_API_URL = https://mot.autodun.com/api/mot-history
 * Optional:
 *  - MOT_PREDICTOR_WEB_URL = https://mot.autodun.com/
 */
async function tool_get_mot_history(vrm: string) {
  const base = process.env.MOT_PREDICTOR_API_URL;
  if (!base) throw new Error("Missing MOT_PREDICTOR_API_URL");

  const url = `${base}?vrm=${encodeURIComponent(vrm)}`;
  const r = await fetch(url, { method: "GET" });

  if (!r.ok) throw new Error(`MOT lookup failed (${r.status})`);
  return r.json();
}

// Tool: MOT risk (simple heuristic fallback when no VRM is provided)
async function tool_get_mot_risk_summary(input: { vehicle_age_years?: number; mileage?: number }) {
  const age = input.vehicle_age_years ?? null;
  const miles = input.mileage ?? null;

  let risk: "LOW" | "MEDIUM" | "HIGHER" = "MEDIUM";
  if ((age !== null && age >= 12) || (miles !== null && miles >= 120000)) risk = "HIGHER";
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

/**
 * Realistic EV tool: fetch nearby chargers from your EV Finder.
 *
 * ENV OPTIONAL:
 *  - EV_FINDER_NEARBY_URL (defaults to https://ev.autodun.com/api/nearby)
 */
type EvStation = {
  id?: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  distance_miles?: number;
  connectors?: string[];
  operator?: string;
};

const EV_FINDER_NEARBY_URL =
  process.env.EV_FINDER_NEARBY_URL || "https://ev.autodun.com/api/nearby";

async function tool_get_ev_nearby_from_autodun(input: {
  postcode: string;
  radius_miles?: number;
  limit?: number;
}) {
  const radius = input.radius_miles ?? 5;
  const limit = input.limit ?? 5;

  // Expected:
  // GET {EV_FINDER_NEARBY_URL}?postcode=SW1A%201AA&radius_miles=5&limit=5
  const url = `${EV_FINDER_NEARBY_URL}?postcode=${encodeURIComponent(
    input.postcode
  )}&radius_miles=${encodeURIComponent(String(radius))}&limit=${encodeURIComponent(String(limit))}`;

  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`EV Finder request failed (${r.status})`);

  const data = await r.json();

  // Accept either {stations:[...]} or [...] responses
  const stations: EvStation[] = Array.isArray(data?.stations)
    ? data.stations
    : Array.isArray(data)
    ? data
    : [];

  return stations.slice(0, limit);
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

// -----------------------
// Responses
// -----------------------

function oosResponse(id: string, tool_calls: AgentResponse["meta"]["tool_calls"]): AgentResponse {
  return {
    status: "out_of_scope",
    intent: "unknown_out_of_scope",
    sections: {
      understanding: "This request is outside the current Autodun AI Assistant scope.",
      analysis: [
        "Autodun AI Assistant is a bounded routing agent. It does not provide general internet advice.",
        "Supported workflows in v1: MOT preparation, EV charging readiness, used-car buying checks.",
      ],
      recommended_next_step:
        "If your question relates to MOT risk, EV charging, or a used-car checklist, rephrase it and I’ll route you to the right tool.",
    },
    actions: [
      { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
      { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: { request_id: id, tool_calls },
  };
}

function formatStationLine(s: EvStation, idx: number) {
  const dist = typeof s.distance_miles === "number" ? ` — ${s.distance_miles.toFixed(1)} mi` : "";
  const addr = s.address ? ` — ${s.address}` : "";
  const con = s.connectors?.length ? ` — ${s.connectors.join(", ")}` : "";
  const op = s.operator ? ` — ${s.operator}` : "";
  return `${idx + 1}. ${s.name || "Charging location"}${dist}${addr}${con}${op}`;
}

function safeStr(v: any): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function countAdvisories(motData: any): number | null {
  // Heuristic: look for arrays on common keys, but do not assume exact schema
  const candidates = [
    motData?.advisories,
    motData?.motTests?.[0]?.advisories,
    motData?.motTests?.[0]?.advisoryNoticeItems,
    motData?.motTests?.[0]?.rfrAndComments,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c.length;
  }
  return null;
}

// -----------------------
// Handler
// -----------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = requestId();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const text = String(req.body?.text || "").trim();
  if (text.length < 8 || text.length > 800) return res.status(400).json({ error: "Invalid text length" });

  const intent = classifyIntent(text);
  const tool_calls: AgentResponse["meta"]["tool_calls"] = [];

  try {
    if (intent === "unknown_out_of_scope") {
      return res.status(200).json(oosResponse(id, tool_calls));
    }

    // -----------------------
    // MOT
    // -----------------------
    if (intent === "mot_preparation") {
      const vrm = extractVRM(text);

      // If VRM present → live MOT history via mot.autodun.com proxy
      if (vrm) {
        const t0 = Date.now();
        const motData = await tool_get_mot_history(vrm);
        tool_calls.push({ name: "get_mot_history", ok: true, ms: Date.now() - t0 });

        // Build a safe summary without assuming exact schema
        const make = safeStr(motData?.vehicle?.make) || safeStr(motData?.make);
        const model = safeStr(motData?.vehicle?.model) || safeStr(motData?.model);
        const fuel = safeStr(motData?.vehicle?.fuelType) || safeStr(motData?.fuelType);
        const firstUsed = safeStr(motData?.vehicle?.firstUsedDate) || safeStr(motData?.firstUsedDate);
        const advCount = countAdvisories(motData);

        const analysis: string[] = [
          `VRM detected: ${vrm}`,
          make ? `Make: ${make}` : "Make: (not available)",
          model ? `Model: ${model}` : "Model: (not available)",
          fuel ? `Fuel: ${fuel}` : "Fuel: (not available)",
          firstUsed ? `First used: ${firstUsed}` : "First used: (not available)",
          typeof advCount === "number"
            ? `Recent advisory items detected: ${advCount}`
            : "Advisories: review in MOT tool for details",
          "Next: focus on repeat failure/advisory themes (tyres, brakes, suspension, lights).",
          "If you share mileage + last service date, we can add a tighter risk band.",
        ];

        const out: AgentResponse = {
          status: "ok",
          intent,
          sections: {
            understanding: "You want MOT guidance, and we pulled live MOT history via Autodun MOT.",
            analysis,
            recommended_next_step: "Open MOT Predictor to view full history and next actions.",
          },
          actions: [
            {
              label: "Open MOT Predictor",
              href: process.env.MOT_PREDICTOR_WEB_URL || "https://mot.autodun.com/",
              type: "primary",
            },
            { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
          ],
          meta: { request_id: id, tool_calls },
        };

        return res.status(200).json(out);
      }

      // No VRM → fallback to heuristic
      const age = extractAgeYears(text);
      const miles = extractMileage(text);

      if (age === null && miles === null) {
        const out: AgentResponse = {
          status: "needs_clarification",
          intent,
          sections: {
            understanding: "You want MOT guidance, but key details are missing.",
            analysis: [
              "Share either a VRM (registration) for live MOT lookup, or provide age + mileage for a quick risk estimate.",
            ],
            recommended_next_step: "Reply with your VRM (example: ML58FOU) OR tell me vehicle age and mileage.",
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
      const mot = await tool_get_mot_risk_summary({
        vehicle_age_years: age ?? undefined,
        mileage: miles ?? undefined,
      });
      tool_calls.push({ name: "get_mot_risk_summary", ok: true, ms: Date.now() - t0 });

      const out: AgentResponse = {
        status: "ok",
        intent,
        sections: {
          understanding: "You want an MOT risk view and what to check before the test.",
          analysis: [`Risk band: ${mot.risk_band}.`, ...mot.drivers, ...mot.checklist.slice(0, 3)],
          recommended_next_step: "Open MOT Predictor to run a personalised estimate and next actions.",
        },
        actions: [
          { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: { request_id: id, tool_calls },
      };
      return res.status(200).json(out);
    }

    // -----------------------
    // EV
    // -----------------------
    if (intent === "ev_charging_readiness") {
      const postcode = extractPostcode(text);

      if (!postcode) {
        const out: AgentResponse = {
          status: "needs_clarification",
          intent,
          sections: {
            understanding: "You want EV charging guidance near you.",
            analysis: [
              "To show nearby chargers, I need your UK postcode.",
              "Optional: include connector preference (CCS, Type 2, CHAdeMO) and whether you want rapid only.",
            ],
            recommended_next_step: "Reply with your postcode (example: SW1A 1AA).",
          },
          actions: [
            { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
            { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
          ],
          meta: { request_id: id, tool_calls },
        };
        return res.status(200).json(out);
      }

      const t0 = Date.now();
      const stations = await tool_get_ev_nearby_from_autodun({ postcode, radius_miles: 5, limit: 5 });
      tool_calls.push({ name: "ev_finder_nearby", ok: true, ms: Date.now() - t0 });

      const lines =
        stations.length > 0
          ? [
              `Top chargers near ${postcode} (from Autodun EV Finder):`,
              ...stations.map((s, i) => formatStationLine(s, i)),
              "Tip: Prefer sites with multiple stalls and a backup within 10–15 minutes.",
            ]
          : [
              `No stations returned for ${postcode}.`,
              "Try a nearby postcode or open EV Charger Finder to search on the map.",
            ];

      const out: AgentResponse = {
        status: "ok",
        intent,
        sections: {
          understanding: `You want nearby EV charging options for ${postcode}.`,
          analysis: lines,
          recommended_next_step: "Open EV Charger Finder to view these chargers on the map and get directions.",
        },
        actions: [
          {
            label: "Open EV Charger Finder",
            href: `https://ev.autodun.com/?postcode=${encodeURIComponent(postcode)}`,
            type: "primary",
          },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: { request_id: id, tool_calls },
      };
      return res.status(200).json(out);
    }

    // -----------------------
    // Used car
    // -----------------------
    const t0 = Date.now();
    const used = await tool_get_used_car_buyer_checklist();
    tool_calls.push({ name: "get_used_car_buyer_checklist", ok: true, ms: Date.now() - t0 });

    const out: AgentResponse = {
      status: "ok",
      intent: "used_car_buyer",
      sections: {
        understanding: "You want a used-car checklist to reduce buying risk.",
        analysis: [...used.must_check.slice(0, 4), ...used.red_flags.slice(0, 2)],
        recommended_next_step: "Use the MOT tool to review MOT history before committing.",
      },
      actions: [
        { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls },
    };
    return res.status(200).json(out);
  } catch {
    const out: AgentResponse = {
      status: "error",
      intent,
      sections: {
        understanding: "We could not complete the analysis.",
        analysis: ["A temporary error occurred while running the agent."],
        recommended_next_step: "Please try again.",
      },
      actions: [
        { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls },
    };
    return res.status(500).json(out);
  }
}
