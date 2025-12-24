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
 * UK postcode extractor (v1)
 * Matches: SW1A 1AA, M1 1AE, B338TH (keeps as B33 8TH if space exists)
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
// Tools
// -----------------------

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

type EvStation = {
  id?: string | number;
  name?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  connectors?: string[];
  connectorsDetailed?: any;
  operator?: string;
  source?: string;
};

const EV_FINDER_STATIONS_URL =
  process.env.EV_FINDER_STATIONS_URL || "https://ev.autodun.com/api/stations";
const EV_FINDER_WEB_URL = process.env.EV_FINDER_WEB_URL || "https://ev.autodun.com/";

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 3958.8; // Earth radius miles
  const toRad = (x: number) => (x * Math.PI) / 180;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return R * c;
}

// Postcode -> lat/lng (server-side)
async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const lat = j?.result?.latitude;
  const lng = j?.result?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}

/**
 * ✅ FIXED:
 * Your EV Finder API returns { items: [...] } when called with lat/lng params.
 * Previously you were calling EV_FINDER_STATIONS_URL without params and only reading {stations:[...]} or [...]
 * This always produced [] -> which triggered the "No stations with coordinates..." message.
 */
async function fetchStationsNear(params: {
  lat: number;
  lng: number;
  radiusMiles?: number;
  max?: number;
}): Promise<EvStation[]> {
  const radiusMiles = typeof params.radiusMiles === "number" ? params.radiusMiles : 10;
  const max = typeof params.max === "number" ? params.max : 50;

  const u = new URL(EV_FINDER_STATIONS_URL);
  u.searchParams.set("lat", String(params.lat));
  u.searchParams.set("lng", String(params.lng));
  u.searchParams.set("radius", String(radiusMiles));
  u.searchParams.set("max", String(max));

  const r = await fetch(u.toString(), { method: "GET" });
  if (!r.ok) throw new Error(`Stations fetch failed (${r.status})`);

  const data = await r.json();

  // ✅ Accept {items:[...]} (your real API), plus legacy shapes for safety
  const stations: EvStation[] = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.stations)
    ? data.stations
    : Array.isArray(data)
    ? data
    : [];

  return stations;
}

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
      { label: "Open EV Charger Finder", href: EV_FINDER_WEB_URL, type: "secondary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: { request_id: id, tool_calls },
  };
}

function formatStationLine(s: EvStation, idx: number, distanceMiles?: number) {
  const dist = typeof distanceMiles === "number" ? ` — ${distanceMiles.toFixed(1)} mi` : "";
  const addr = s.address ? ` — ${s.address}` : "";
  const con =
    (s as any).connectorsDetailed?.length
      ? ` — ${String((s as any).connectorsDetailed[0]?.type || "").trim()}`
      : s.connectors?.length
      ? ` — ${s.connectors.join(", ")}`
      : "";
  const op = s.operator ? ` — ${s.operator}` : "";
  return `${idx + 1}. ${s.name || "Charging location"}${dist}${addr}${con}${op}`;
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
// Handler
// -----------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = requestId();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const text = String(req.body?.text || "").trim();
  if (text.length < 3 || text.length > 800)
    return res.status(400).json({ error: "Invalid text length" });

  const intent = classifyIntent(text);
  const tool_calls: AgentResponse["meta"]["tool_calls"] = [];

  try {
    if (intent === "unknown_out_of_scope") return res.status(200).json(oosResponse(id, tool_calls));

    // ---------------- MOT ----------------
    if (intent === "mot_preparation") {
      const vrm = extractVRM(text);
      const age = extractAgeYears(text);
      const miles = extractMileage(text);

      // If user provided VRM, send them to MOT Predictor directly (realistic workflow)
      if (vrm) {
        const out: AgentResponse = {
          status: "ok",
          intent,
          sections: {
            understanding: `You want to know MOT risk for VRM ${vrm}.`,
            analysis: [
              "Use MOT Predictor to pull MOT history and highlight repeat advisories/fail areas.",
              "Then act on the top wear items (brakes, suspension, tyres) before test day.",
            ],
            recommended_next_step: "Open MOT Predictor and run the check using your VRM.",
          },
          actions: [
            {
              label: "Open MOT Predictor",
              href: `https://mot.autodun.com/?vrm=${encodeURIComponent(vrm)}`,
              type: "primary",
            },
            { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
          ],
          meta: { request_id: id, tool_calls },
        };
        return res.status(200).json(out);
      }

      // If no VRM, use age/mileage heuristic
      if (age === null && miles === null) {
        const out: AgentResponse = {
          status: "needs_clarification",
          intent,
          sections: {
            understanding: "You want MOT guidance, but key details are missing.",
            analysis: ["Tell me VRM OR vehicle age + mileage to estimate risk and give a checklist."],
            recommended_next_step:
              "Reply with your VRM (example: ML58FOU) or say “10 years old, 85k miles”.",
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
          analysis: [`Risk band: ${mot.risk_band}.`, ...mot.drivers, ...mot.checklist.slice(0, 4)],
          recommended_next_step:
            "Open MOT Predictor to run a personalised check (VRM-based) and next actions.",
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
              "To show nearby chargers, I need your UK postcode.",
              "Optional: include connector preference (CCS, Type 2, CHAdeMO) and whether you want rapid only.",
            ],
            recommended_next_step: "Reply with your postcode (example: SW1A 1AA).",
          },
          actions: [
            { label: "Open EV Charger Finder", href: EV_FINDER_WEB_URL, type: "primary" },
            { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
          ],
          meta: { request_id: id, tool_calls },
        };
        return res.status(200).json(out);
      }

      const tGeo = Date.now();
      const geo = await geocodePostcode(postcode);
      tool_calls.push({ name: "postcode_geocode", ok: !!geo, ms: Date.now() - tGeo });

      if (!geo) {
        const out: AgentResponse = {
          status: "error",
          intent,
          sections: {
            understanding: `We could not geocode postcode ${postcode}.`,
            analysis: ["Please check the postcode and try again."],
            recommended_next_step:
              "Try another nearby postcode, or open EV Charger Finder to search on the map.",
          },
          actions: [
            { label: "Open EV Charger Finder", href: EV_FINDER_WEB_URL, type: "primary" },
            { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
          ],
          meta: { request_id: id, tool_calls },
        };
        return res.status(200).json(out);
      }

      // ✅ FIX: fetch stations near the geocoded lat/lng (returns {items:[...]} with lat/lng)
      const tStations = Date.now();
      const stations = await fetchStationsNear({
        lat: geo.lat,
        lng: geo.lng,
        radiusMiles: 10,
        max: 50,
      });
      tool_calls.push({ name: "ev_finder_stations", ok: true, ms: Date.now() - tStations });

      const withDistance = stations
        .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
        .map((s) => ({
          s,
          d: haversineMiles(geo.lat, geo.lng, s.lat as number, s.lng as number),
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5);

      const lines =
        withDistance.length > 0
          ? [
              `Top chargers near ${postcode} (computed from Autodun EV Finder stations):`,
              ...withDistance.map((x, i) => formatStationLine(x.s, i, x.d)),
              "Tip: Prefer sites with multiple stalls and keep a backup within 10–15 minutes.",
            ]
          : [
              `No stations with coordinates were returned from EV Finder for distance sorting.`,
              "Open EV Charger Finder to search on the map.",
            ];

      const out: AgentResponse = {
        status: "ok",
        intent,
        sections: {
          understanding: `You want nearby EV charging options for ${postcode}.`,
          analysis: lines,
          recommended_next_step: "Open EV Charger Finder to view on map and get directions.",
        },
        actions: [
          {
            label: "Open EV Charger Finder",
            href: `${EV_FINDER_WEB_URL}?postcode=${encodeURIComponent(postcode)}`,
            type: "primary",
          },
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
        understanding: "You want a used-car checklist to reduce buying risk.",
        analysis: [...used.must_check.slice(0, 4), ...used.red_flags.slice(0, 2)],
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
        { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
        { label: "Open EV Charger Finder", href: EV_FINDER_WEB_URL, type: "secondary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls },
    };
    return res.status(500).json(out);
  }
}
