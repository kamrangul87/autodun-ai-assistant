import type { NextApiRequest, NextApiResponse } from "next";

/* =======================
   CANONICAL: MOT Intelligence v3 (Layered)
   Layers 1–7 implemented here.
   Minimal, surgical edits only.
======================= */

/* =======================
   Agent Types
======================= */

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
  meta: {
    request_id: string;
    tool_calls: Array<{ name: string; ok: boolean; ms: number }>;
    version?: string;
    layers?: string[];
  };
};

function requestId() {
  return "agt_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* =======================
   Intent Classification
======================= */

function classifyIntent(text: string): AgentIntent {
  const t = (text || "").toLowerCase();

  // Explicit OOS
  if (
    ["visa", "job", "health", "bitcoin", "immigration", "loan", "finance"].some((k) =>
      t.includes(k)
    )
  ) {
    return "unknown_out_of_scope";
  }

  // ✅ EV intent (now real detection, not only "postcode")
  const hasPostcode = /\b([a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2})\b/i.test(text || "");
  const evKeywords = /(charger|charging|ev|station|type\s*2|ccs|chademo|rapid|fast\s*charge)/i.test(
    text || ""
  );
  if (evKeywords || hasPostcode) {
    return "ev_charging_readiness";
  }

  // Used-car intent (intentionally out-of-scope for this canonical MOT endpoint)
  if (
    ["buy", "buying", "used", "second hand", "v5", "hpi", "cat s", "cat n"].some((k) =>
      t.includes(k)
    )
  ) {
    return "used_car_buyer";
  }

  // Default to MOT
  return "mot_preparation";
}

/* =======================
   Extractors
======================= */

function extractVRM(text: string): string | null {
  const m = (text || "").toUpperCase().match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/);
  return m ? m[1].replace(/\s+/g, "") : null;
}

// ✅ Added (minimal): age extractor
function extractAgeYears(text: string): number | null {
  const m = (text || "").toLowerCase().match(/(\d{1,2})\s*(years|year|yrs|yr)\s*old/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

// ✅ Added (minimal): mileage extractor
function extractMileage(text: string): number | null {
  const t = (text || "").toLowerCase().replace(/,/g, "");
  const k = t.match(/(\d{2,3})\s*k\s*miles/);
  if (k) return parseInt(k[1], 10) * 1000;

  const m = t.match(/(\d{4,6})\s*miles/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

// ✅ NEW: postcode extractor (EV workflow)
function extractPostcode(text: string): string | null {
  const m = (text || "").toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}


// ✅ NEW: place/city extractor (EV workflow) — e.g., "near Ilford", "in Manchester"
function extractPlaceName(text: string): string | null {
  const t = (text || "").trim();
  if (!t) return null;

  // If there's already a postcode, prefer postcode flow.
  if (extractPostcode(t)) return null;

  // Try common patterns: "near X", "in X", "around X"
  const m = t.match(/\b(?:near|in|around)\s+([A-Za-z][A-Za-z\s\-']{2,50})/i);
  const raw = (m?.[1] || "").trim();

  if (!raw) return null;

  // Stop at punctuation if user typed: "near Ilford, ..."
  const cleaned = raw.split(/[.,;:!?]/)[0].trim();

  // Keep it short/sane
  if (cleaned.length < 2 || cleaned.length > 50) return null;

  return cleaned;
}

/* =======================
   EV Helpers (minimal)
======================= */

// ✅ FIXED: signature to match how you call it below (lat1,lng1,lat2,lng2)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.asin(Math.sqrt(x));
}

async function geocodeUKPostcode(postcode: string) {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  const r = await fetch(url, { method: "GET" });
  const j = await r.json().catch(() => null);

  if (!r.ok || typeof j?.result?.latitude !== "number" || typeof j?.result?.longitude !== "number") {
    const msg = j?.error || `Postcode lookup failed (${r.status})`;
    throw new Error(msg);
  }

  return { lat: Number(j.result.latitude), lng: Number(j.result.longitude) };
}

// ✅ ADDED: wrapper used by your EV tool (returns null instead of throwing)
async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    return await geocodeUKPostcode(postcode);
  } catch {
    return null;
  }
}


// ✅ NEW: geocode UK place/city using postcodes.io Places API (Ilford, Manchester, etc.)
async function geocodeUKPlace(place: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://api.postcodes.io/places?q=${encodeURIComponent(place)}&limit=1`;
    const r = await fetch(url, { method: "GET" });
    const j = await r.json().catch(() => null);

    const p = Array.isArray(j?.result) ? j.result[0] : null;
    const lat = Number(p?.latitude);
    const lng = Number(p?.longitude);

    if (!r.ok || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

type StationLike = {
  id?: string;
  name?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  location?: { lat?: number; lng?: number };
  connectors?: Array<{ type?: string; power_kw?: number; power?: number; count?: number }>;
};

function stationLatLng(s: StationLike): { lat: number; lng: number } | null {
  const lat =
    typeof s.lat === "number" ? s.lat : typeof s.location?.lat === "number" ? s.location.lat : null;
  const lng =
    typeof s.lng === "number" ? s.lng : typeof s.location?.lng === "number" ? s.location.lng : null;
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function connectorSummary(s: StationLike) {
  const cs = Array.isArray(s.connectors) ? s.connectors : [];
  if (!cs.length) return "Connectors: unknown";

  const types = Array.from(new Set(cs.map((c) => (c.type || "").trim()).filter(Boolean)));
  const maxPower = Math.max(
    ...cs.map((c) => Number(c.power_kw ?? c.power ?? 0)).filter((n) => Number.isFinite(n))
  );

  const t = types.length ? types.join(", ") : "Unknown";
  const p = maxPower > 0 ? ` (up to ${Math.round(maxPower)}kW)` : "";
  return `Connectors: ${t}${p}`;
}


// ✅ NEW: optional Supabase stations fetch (preferred when env vars are present)
// Uses PostgREST directly (no extra dependencies).
async function fetchStationsFromSupabase(
  limit = 50000
): Promise<{ ok: boolean; stations: StationLike[]; error?: string }> {
  if (!EV_SUPABASE_URL || !EV_SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, stations: [], error: "Supabase env not set" };
  }

  // NOTE: adjust table/columns if you rename schema. Defaults assume:
  // ev_stations(id, name, address, postcode, lat, lng, connectors jsonb)
  const url =
    `${EV_SUPABASE_URL.replace(/\/$/, "")}` +
    `/rest/v1/ev_stations?select=id,name,address,postcode,lat,lng,connectors&limit=${limit}`;

  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        apikey: EV_SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${EV_SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, stations: [], error: `Supabase ${r.status}: ${t.slice(0, 200)}` };
    }

   const rows = (await r.json()) as any[];

const stations: StationLike[] = Array.isArray(rows)
  ? rows
      .map((row) => {
        const lat = Number(row?.lat);
        const lng = Number(row?.lng);

        // If invalid lat/lng, return null (filtered out below)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const connectors = Array.isArray(row?.connectors)
          ? row.connectors
          : Array.isArray(row?.connectorsDetailed)
          ? row.connectorsDetailed
          : null;

        return {
          id: String(row?.id ?? ""),
          name: String(row?.name ?? "Charging location"),
          address: String(row?.address ?? ""),
          postcode: String(row?.postcode ?? ""),
          lat,
          lng,
          connectors: Array.isArray(connectors) ? connectors : [],
        } as StationLike;
      })
      // ✅ THIS is the key line: it removes nulls AND fixes the TypeScript type
      .filter((x): x is StationLike => x !== null)
  : [];


/* =======================
   MOT Types
======================= */

type MotDefect = { text?: string; type?: string };
type MotTest = {
  completedDate?: string;
  testResult?: string;
  odometerValue?: string;
  odometerUnit?: string;
  defects?: MotDefect[];
};
type MotHistory = {
  firstUsedDate?: string;
  registrationDate?: string;
  make?: string;
  model?: string;
  fuelType?: string;
  primaryColour?: string;
  motTests?: MotTest[];
};

type ThemeYearStat = {
  first_seen: number;
  last_seen: number;
  count: number;
  years: number[];
};

type FixDecision = {
  theme: string;
  decision: "FIX" | "MONITOR";
  confidence: "HIGH" | "MEDIUM";
  reason: string;
};

type RiskBand = "LOW" | "MEDIUM" | "HIGH";

/* =======================
   Utilities
======================= */

function yearsSince(d?: string): number | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.max(0, (Date.now() - dt.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function parseMileage(v?: string): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function sortTestsNewestFirst(tests: MotTest[]) {
  return [...tests].sort((a, b) => {
    const da = new Date(a?.completedDate || 0).getTime();
    const db = new Date(b?.completedDate || 0).getTime();
    return db - da;
  });
}

/* =======================
   Theme Classifier
======================= */

function themeFromText(t: string): string {
  const s = (t || "").toLowerCase();
  const has = (...k: string[]) => k.some((x) => s.includes(x));

  if (has("tyre", "tread", "sidewall", "bulge", "cord")) return "tyres";
  if (has("suspension", "bush", "shock", "arm", "ball joint", "drop link", "wishbone"))
    return "suspension";
  if (
    has(
      "brake",
      "disc",
      "pad",
      "caliper",
      "handbrake",
      "parking brake",
      "abs",
      "brake pipe",
      "brake hose"
    )
  )
    return "brakes";
  if (has("exhaust", "silencer", "flexi", "flexible joint", "muffler")) return "exhaust";
  if (has("corrosion", "rust", "subframe", "chassis", "structural", "mounting")) return "corrosion";
  if (has("emission", "lambda", "dpf", "egr", "catalyst", "smoke", "o2 sensor")) return "emissions";
  return "other";
}

/* =======================
   Risk Scoring (Layer-1)
======================= */

function scoreMotRisk(input: {
  ageYears?: number | null;
  mileage?: number | null;
  latestResult?: string | null;
  repeatThemes: Record<string, number>;
}): { score: number; band: RiskBand } {
  let score = 20;

  if (typeof input.ageYears === "number") {
    if (input.ageYears >= 15) score += 20;
    else if (input.ageYears >= 10) score += 15;
    else if (input.ageYears >= 6) score += 8;
  }

  if (typeof input.mileage === "number") {
    if (input.mileage >= 160000) score += 18;
    else if (input.mileage >= 120000) score += 15;
    else if (input.mileage >= 80000) score += 8;
  }

  if ((input.latestResult || "").toUpperCase().includes("FAIL")) score += 20;

  // Repeat-theme pressure
  score += Math.min(30, Object.values(input.repeatThemes).filter((n) => n >= 2).length * 5);

  score = Math.min(100, Math.max(0, score));
  return { score, band: score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW" };
}

/* =======================
   FIX vs MONITOR (Layer-2)
======================= */

function decideFixOrIgnore(
  patterns: {
    theme: string;
    repeat_count: number;
    last_seen_year: number;
    trend: "worsening" | "stable" | "improving";
  }[]
): FixDecision[] {
  const currentYear = new Date().getFullYear();

  return patterns.map((p) => {
    const recent = p.last_seen_year >= currentYear - 1; // seen this year/last year
    const repeated = p.repeat_count >= 3;
    const worsening = p.trend === "worsening";

    if (recent && repeated && worsening) {
      return {
        theme: p.theme,
        decision: "FIX",
        confidence: "HIGH",
        reason: "Repeated defects in recent MOTs with a worsening pattern",
      };
    }

    // If it's repeated but not worsening, it’s still worth monitoring carefully (MEDIUM).
    return {
      theme: p.theme,
      decision: "MONITOR",
      confidence: repeated ? "MEDIUM" : "HIGH",
      reason: repeated
        ? "Repeated but not clearly worsening; monitor and inspect before MOT"
        : "No strong evidence of worsening defects in recent MOTs",
    };
  });
}

/* =======================
   COST IMPACT (Layer-3)
======================= */

const COST_RANGES: Record<string, { min: number; max: number }> = {
  suspension: { min: 300, max: 1200 },
  brakes: { min: 150, max: 600 },
  tyres: { min: 120, max: 450 },
  exhaust: { min: 150, max: 700 },
  corrosion: { min: 300, max: 2500 },
  emissions: { min: 100, max: 900 },
  other: { min: 150, max: 600 },
};

function estimateCost(decisions: FixDecision[]) {
  let minTotal = 0;
  let maxTotal = 0;

  const breakdown = decisions
    .filter((d) => d.decision === "FIX")
    .map((d) => {
      const r = COST_RANGES[d.theme] || COST_RANGES.other;
      minTotal += r.min;
      maxTotal += r.max;
      return { theme: d.theme, range: `£${r.min} – £${r.max}` };
    });

  return { minTotal, maxTotal, breakdown };
}

/* =======================
   MOT READINESS (Layer-4)
======================= */

function calculateMotReadiness(input: {
  decisions: FixDecision[];
  patterns: { trend: "worsening" | "stable" | "improving" }[];
  riskBand: RiskBand;
  estimatedMaxCost: number;
}) {
  let score = 100;
  const reasons: string[] = [];
  const improvements: string[] = [];

  const fixCount = input.decisions.filter((d) => d.decision === "FIX").length;
  if (fixCount) {
    score -= fixCount * 25;
    reasons.push(`${fixCount} critical system(s) require immediate repair`);
    improvements.push(`Fix ${fixCount} critical item(s) (+${fixCount * 25})`);
  }

  const worseningCount = input.patterns.filter((p) => p.trend === "worsening").length;
  if (worseningCount) {
    score -= worseningCount * 15;
    reasons.push("Worsening defect patterns detected");
    improvements.push(`Resolve worsening patterns (+${worseningCount * 15})`);
  }

  if (input.riskBand === "HIGH") {
    score -= 15;
    reasons.push("Overall MOT risk is high");
    improvements.push("Reduce overall risk (+15)");
  }

  if (input.estimatedMaxCost > 1000) {
    score -= 10;
    reasons.push("High expected repair cost before MOT");
    improvements.push("Reduce repair cost exposure (+10)");
  }

  score = Math.max(0, Math.min(100, score));

  let label: "READY" | "FAIR" | "POOR" | "NOT READY" = "READY";
  if (score < 40) label = "NOT READY";
  else if (score < 60) label = "POOR";
  else if (score < 80) label = "FAIR";

  return { score, label, reasons, improvements };
}

/* =======================
   REPAIR PRIORITY (Layer-5)
======================= */

function buildRepairTimeline(decisions: FixDecision[]) {
  return decisions.map((d) =>
    d.decision === "FIX"
      ? { theme: d.theme, priority: "NOW" as const, reason: "High MOT failure probability" }
      : { theme: d.theme, priority: "BEFORE NEXT MOT" as const, reason: "Monitor condition" }
  );
}

/* =======================
   OWNERSHIP DECISION (Layer-6)
======================= */

function decideKeepOrReplace(input: {
  ageYears: number | null;
  mileage: number | null;
  estimatedMaxCost: number;
  readinessScore: number;
  riskBand: RiskBand;
  fixNowCount: number;
}) {
  let signals = 0;
  const reasons: string[] = [];

  if (input.ageYears !== null && input.ageYears >= 10) {
    signals++;
    reasons.push("Vehicle age exceeds 10 years");
  }

  if (input.mileage !== null && input.mileage >= 120000) {
    signals++;
    reasons.push("High mileage increases long-term maintenance risk");
  }

  if (input.estimatedMaxCost >= 1500) {
    signals += 2;
    reasons.push("Expected MOT-related repairs are expensive");
  }

  if (input.readinessScore <= 50) {
    signals++;
    reasons.push("Vehicle is poorly prepared for an immediate MOT");
  }

  if (input.fixNowCount >= 2) {
    signals++;
    reasons.push("Multiple critical repairs required immediately");
  }

  if (input.riskBand === "HIGH") {
    signals++;
    reasons.push("High probability of recurring MOT issues");
  }

  let decision: "KEEP" | "CONSIDER_REPLACING" | "REPLACE" = "KEEP";
  if (signals >= 5) decision = "REPLACE";
  else if (signals >= 3) decision = "CONSIDER_REPLACING";

  return {
    decision,
    score: signals,
    reasons,
    keepScenario: ["Expect continued MOT preparation costs", "Repairs may stabilise short-term reliability"],
    replaceScenario: ["Avoid escalating repair expenses", "Improve reliability and ownership predictability"],
  };
}

/* =======================
   LAYER-7: EXECUTIVE SYNTHESIS
======================= */

function buildLayer7(input: {
  vrm: string;
  vehicle: { ageYears: number | null; mileage: number | null };
  risk: { score: number; band: RiskBand };
  readiness: {
    score: number;
    label: "READY" | "FAIR" | "POOR" | "NOT READY";
    reasons: string[];
    improvements: string[];
  };
  timeline: Array<{ theme: string; priority: "NOW" | "BEFORE NEXT MOT"; reason: string }>;
  cost: { minTotal: number; maxTotal: number; breakdown: Array<{ theme: string; range: string }> };
  ownership: { decision: "KEEP" | "CONSIDER_REPLACING" | "REPLACE"; reasons: string[] };
}) {
  const fixNow = input.timeline.filter((t) => t.priority === "NOW").map((t) => t.theme);
  const monitor = input.timeline.filter((t) => t.priority !== "NOW").map((t) => t.theme);

  const topFixNow = fixNow.slice(0, 3);
  const topMonitor = monitor.slice(0, 3);

  const headline =
    input.ownership.decision === "KEEP"
      ? "Ownership outlook: KEEP (with targeted MOT preparation)."
      : input.ownership.decision === "CONSIDER_REPLACING"
      ? "Ownership outlook: CONSIDER REPLACING (cost/risk signals elevated)."
      : "Ownership outlook: REPLACE (high probability of escalating costs).";

  const costLine =
    input.cost.maxTotal > 0
      ? `Estimated MOT-related repairs (if you fix “NOW” items): £${input.cost.minTotal} – £${input.cost.maxTotal}.`
      : "Estimated MOT-related repairs: not enough data to estimate.";

  const readinessLine = `MOT readiness: ${input.readiness.score}/100 (${input.readiness.label}).`;
  const riskLine = `Risk score: ${input.risk.score}/100 (${input.risk.band}).`;

  const actionLines: string[] = [];
  if (topFixNow.length) {
    actionLines.push(`Fix NOW (highest impact): ${topFixNow.join(", ")}.`);
  } else {
    actionLines.push("Fix NOW: none strongly indicated from pattern data (still do a basic pre-MOT inspection).");
  }

  if (topMonitor.length) {
    actionLines.push(`Monitor / plan before next MOT: ${topMonitor.join(", ")}.`);
  }

  let next =
    "Open MOT Predictor to review the full MOT history and book an inspection focused on the “Fix NOW” systems.";

  if (input.ownership.decision === "REPLACE") {
    next =
      "Strongly consider replacing this vehicle. If you still proceed, fix the “Fix NOW” items first and reassess costs.";
  } else if (input.ownership.decision === "CONSIDER_REPLACING") {
    next =
      "Get a repair quote for the “Fix NOW” items. If quotes approach the upper range, consider replacing the vehicle.";
  } else if (input.readiness.label === "NOT READY") {
    next = "Do not attempt an MOT immediately. Fix the “Fix NOW” items, then re-check readiness.";
  }

  const evidence: string[] = [];
  if (input.vehicle.ageYears !== null) evidence.push(`Vehicle age: ~${input.vehicle.ageYears.toFixed(1)} years.`);
  if (input.vehicle.mileage !== null)
    evidence.push(`Latest recorded mileage: ${input.vehicle.mileage.toLocaleString()} miles.`);

  return {
    headline,
    summaryLines: [riskLine, readinessLine, costLine, ...evidence],
    actionLines,
    recommendedNextStep: next,
  };
}

/* =======================
   ✅ NON-VRM MOT CHECKLIST FALLBACK
======================= */

function makeMotChecklistFallback(
  id: string,
  tool_calls: AgentResponse["meta"]["tool_calls"],
  age: number | null,
  miles: number | null
): AgentResponse {
  const context: string[] = [];
  if (age !== null) context.push(`Vehicle age: ${age} years.`);
  if (miles !== null) context.push(`Mileage: ${miles.toLocaleString()} miles.`);

  const checklist = [
    "Lights: all bulbs, indicators, brake lights, number plate lights",
    "Tyres: tread depth, sidewall cracks/bulges, correct pressures",
    "Brakes: pad/disc wear, brake fluid level, handbrake holds on a hill",
    "Wipers & washers: blades, washer jets, washer fluid",
    "Windscreen: chips/cracks in driver’s view",
    "Warning lights: engine/ABS/airbag lights must be off",
    "Steering/suspension: knocking sounds, excessive play, uneven tyre wear",
    "Emissions readiness: service up to date, no smoke, no misfire",
    "Seatbelts: retract/lock properly, no fraying",
    "Leaks: oil/coolant/brake fluid leaks under the car",
  ];

  const focus: string[] = [];
  if (age !== null && age >= 8) focus.push("Extra focus: suspension bushes/ball joints and corrosion checks.");
  if (miles !== null && miles >= 60000) focus.push("Extra focus: brakes, tyres, and suspension wear items.");

  return {
    status: "ok",
    intent: "mot_preparation",
    sections: {
      understanding: "Pre-MOT checklist (no VRM provided).",
      analysis: [
        ...(context.length ? context : ["Tip: Share VRM for full MOT Intelligence (Layers 1–7)."]),
        ...(focus.length ? focus : []),
        "Checklist:",
        ...checklist.map((x) => `• ${x}`),
      ],
      recommended_next_step:
        "If you share your VRM, I’ll run full MOT Intelligence (Layers 1–7) with risk, readiness, cost, and ownership decision.",
    },
    actions: [
      { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: {
      request_id: id,
      tool_calls,
      version: MOT_INTELLIGENCE_VERSION,
      layers: ["L1_intent", "L2_extract", "L7_fallback_checklist"],
    },
  };
}

/* =======================
   MOT Intelligence v3 (Layers 1–7)
======================= */

const MOT_INTELLIGENCE_VERSION = "mot_intelligence_v3_layer7";
const MOT_HISTORY_API_URL =
  process.env.MOT_PREDICTOR_API_URL || "https://mot.autodun.com/api/mot-history";

// ✅ EV stations endpoint (AI assistant uses this)
const EV_FINDER_STATIONS_URL =
  process.env.EV_FINDER_STATIONS_URL || "https://ev.autodun.com/api/stations";

// ✅ Optional: Supabase-backed EV stations (preferred when available)
const EV_SUPABASE_URL = process.env.EV_SUPABASE_URL || process.env.SUPABASE_URL || "";
const EV_SUPABASE_SERVICE_ROLE_KEY =
  process.env.EV_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function tool_get_mot_intelligence_v3(vrm: string) {
  const r = await fetch(`${MOT_HISTORY_API_URL}?vrm=${encodeURIComponent(vrm)}`, { method: "GET" });
  if (!r.ok) throw new Error(`MOT fetch failed (${r.status})`);

  const data = (await r.json()) as MotHistory;

  const testsRaw = Array.isArray(data.motTests) ? data.motTests : [];
  const tests = sortTestsNewestFirst(testsRaw);
  const latest = tests[0] || {};

  const ageYears = yearsSince(data.firstUsedDate || data.registrationDate);
  const mileage = parseMileage(latest.odometerValue);

  const themeCounts: Record<string, number> = {};
  const stats: Record<string, ThemeYearStat> = {};

  for (const t of tests) {
    const year = t.completedDate ? new Date(t.completedDate).getFullYear() : null;
    for (const d of t.defects || []) {
      if (!d.text || !year) continue;
      const theme = themeFromText(d.text);
      themeCounts[theme] = (themeCounts[theme] || 0) + 1;

      if (!stats[theme]) {
        stats[theme] = { first_seen: year, last_seen: year, count: 1, years: [year] };
      } else {
        stats[theme].count++;
        stats[theme].years.push(year);
        stats[theme].last_seen = Math.max(stats[theme].last_seen, year);
      }
    }
  }

  const currentYear = new Date().getFullYear();
  const patterns = Object.entries(stats).map(([theme, s]) => {
    const recentCount = s.years.filter((y) => y >= currentYear - 1).length;
    const olderCount = s.years.filter((y) => y < currentYear - 1).length;

    let trend: "worsening" | "stable" | "improving" = "stable";
    if (s.last_seen < currentYear - 3) trend = "improving";
    else if (s.last_seen >= currentYear - 1 && recentCount >= Math.max(2, olderCount)) trend = "worsening";

    return { theme, repeat_count: s.count, last_seen_year: s.last_seen, trend };
  });

  const decisions = decideFixOrIgnore(patterns);
  const cost = estimateCost(decisions);

  const risk = scoreMotRisk({
    ageYears,
    mileage,
    latestResult: latest.testResult,
    repeatThemes: themeCounts,
  });

  const readiness = calculateMotReadiness({
    decisions,
    patterns,
    riskBand: risk.band,
    estimatedMaxCost: cost.maxTotal,
  });

  const timeline = buildRepairTimeline(decisions);

  const ownership = decideKeepOrReplace({
    ageYears,
    mileage,
    estimatedMaxCost: cost.maxTotal,
    readinessScore: readiness.score,
    riskBand: risk.band,
    fixNowCount: decisions.filter((d) => d.decision === "FIX").length,
  });

  return {
    vrm,
    vehicle: {
      make: data.make,
      model: data.model,
      fuelType: data.fuelType,
      colour: data.primaryColour,
      ageYears,
      mileage,
      latestResult: latest.testResult || null,
      latestCompletedDate: latest.completedDate || null,
    },
    patterns,
    decisions,
    risk,
    readiness,
    timeline,
    cost,
    ownership,
  };
}

// ✅ EV tool: chargers near postcode (FIXED, returns AgentResponse directly)
async function tool_get_ev_chargers_near_postcode(
  text: string,
  id: string,
  tool_calls: AgentResponse["meta"]["tool_calls"]
): Promise<AgentResponse> {
  const postcode = extractPostcode(text);
  const place = !postcode ? extractPlaceName(text) : null;
  const whereLabel = (postcode || place || "").toString().trim();

  if (!postcode && !place) {
    return {
      status: "needs_clarification",
      intent: "ev_charging_readiness",
      sections: {
        understanding: "You want EV charging options, but I need a UK postcode (or a UK place/city name) to find nearby chargers.",
        analysis: ["Example: “chargers near SW1A 1AA”"],
        recommended_next_step: "Reply with your postcode (e.g., SW1A 1AA) or a place/city (e.g., Ilford, Manchester).",
      },
      actions: [
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_postcode_needed"] },
    };
  }

  // ✅ Geocode either postcode or place/city (returns null instead of throwing)
  const tGeo = Date.now();
  const geo = postcode ? await geocodePostcode(postcode) : await geocodeUKPlace(place || "");
  tool_calls.push({
    name: postcode ? "geocode_postcode" : "geocode_place",
    ok: !!geo,
    ms: Date.now() - tGeo,
  });

  if (!geo) {
    return {
      status: "error",
      intent: "ev_charging_readiness",
      sections: {
        understanding: postcode ? `Could not locate postcode ${postcode}.` : `Could not locate place ${place}.`,
        analysis: ["Check the postcode format and try again."],
        recommended_next_step: "Try another UK postcode (e.g., SW1A 1AA), or try a place/city (e.g., Ilford).",
      },
      actions: [
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_geocode_failed"] },
    };
  }

  // ✅ Prefer Supabase stations if configured; fallback to EV Finder feed.
  let raw: any = null;
  let usedSource: "supabase" | "feed" = "feed";

  if (EV_SUPABASE_URL && EV_SUPABASE_SERVICE_ROLE_KEY) {
    const tS = Date.now();
    const supa = await fetchStationsFromSupabase();
    tool_calls.push({ name: "supabase_ev_stations", ok: supa.ok, ms: Date.now() - tS });
    if (supa.ok && supa.stations.length) {
      raw = supa.stations;
      usedSource = "supabase";
    }
  }

  if (!raw) {
    const stationsUrl = EV_FINDER_STATIONS_URL;
    const t0 = Date.now();
    const r = await fetch(stationsUrl, { method: "GET" });
    const ms = Date.now() - t0;
    tool_calls.push({ name: "ev_stations_feed", ok: r.ok, ms });

    if (!r.ok) {
    return {
      status: "error",
      intent: "ev_charging_readiness",
      sections: {
        understanding: "I could not fetch the EV charger feed.",
        analysis: [`Stations feed returned ${r.status}.`],
        recommended_next_step: "Try again in a moment.",
      },
      actions: [
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_fetch_failed"] },
    };
  }

    raw = await r.json();
  }

  // ✅ Robust parsing:
  // - If Supabase was used: raw is already StationLike[]
  // - If feed was used: raw is the JSON payload from /api/stations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  // ✅ Robust feed parsing for your /api/stations shape
  const rawList: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.stations)
    ? raw.stations
    : Array.isArray(raw?.features)
    ? raw.features
    : [];

  const stations: StationLike[] = rawList
    .map((s: any) => {
      const props = s?.properties || s;

      const lat =
        typeof props?.lat === "number"
          ? props.lat
          : typeof props?.latitude === "number"
          ? props.latitude
          : Array.isArray(s?.geometry?.coordinates)
          ? Number(s.geometry.coordinates[1])
          : null;

      const lng =
        typeof props?.lng === "number"
          ? props.lng
          : typeof props?.lon === "number"
          ? props.lon
          : typeof props?.longitude === "number"
          ? props.longitude
          : Array.isArray(s?.geometry?.coordinates)
          ? Number(s.geometry.coordinates[0])
          : null;

      if (!Number.isFinite(lat as any) || !Number.isFinite(lng as any)) return null;

      const connectorsDetailed = Array.isArray(props?.connectorsDetailed) ? props.connectorsDetailed : [];
      const connectorsLegacy = Array.isArray(props?.connectors) ? props.connectors : [];

      const connectors: StationLike["connectors"] =
        connectorsDetailed.length
          ? connectorsDetailed.map((c: any) => ({
              type: String(c?.type || ""),
              power_kw:
                typeof c?.powerKW === "number"
                  ? c.powerKW
                  : typeof c?.power_kw === "number"
                  ? c.power_kw
                  : null,
              count:
                typeof c?.quantity === "number"
                  ? c.quantity
                  : typeof c?.count === "number"
                  ? c.count
                  : 1,
            }))
          : connectorsLegacy.map((c: any) => ({
              type: String(c?.type || ""),
              power_kw:
                typeof c?.power_kw === "number"
                  ? c.power_kw
                  : typeof c?.powerKW === "number"
                  ? c.powerKW
                  : null,
              count:
                typeof c?.count === "number"
                  ? c.count
                  : typeof c?.quantity === "number"
                  ? c.quantity
                  : 1,
            }));

      return {
        id: String(props?.id ?? props?.station_id ?? props?.ID ?? ""),
        name: String(props?.name ?? props?.title ?? "Charging location"),
        address: String(props?.address ?? props?.location ?? ""),
        postcode: String(props?.postcode ?? props?.post_code ?? ""),
        connectors,
        lat: lat as number,
        lng: lng as number,
      } as StationLike;
    })
    .filter(Boolean) as StationLike[];

  if (!stations.length) {
    return {
      status: "ok",
      intent: "ev_charging_readiness",
      sections: {
        understanding: `EV charging options near ${whereLabel}.`,
        analysis: ["Stations feed returned 0 items (unexpected).", "Tip: Open EV Finder and search manually."],
        recommended_next_step: "Open EV Charger Finder to view chargers on the map.",
      },
      actions: [
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_feed_empty"] },
    };
  }

  const scored = stations
    .map((s) => {
      const ll = stationLatLng(s);
      if (!ll) return null;
      const d = haversineKm(geo.lat, geo.lng, ll.lat, ll.lng);
      return { s, d };
    })
    .filter(Boolean) as Array<{ s: StationLike; d: number }>;

  const nearby = scored
    .filter((x) => x.d <= 10)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);

  if (!nearby.length) {
    const closest = scored.sort((a, b) => a.d - b.d).slice(0, 5);

    return {
      status: "ok",
      intent: "ev_charging_readiness",
      sections: {
        understanding: `EV charging options near ${whereLabel}.`,
        analysis: [
          "No stations found within 10km in the current feed.",
          ...(closest.length
            ? [
                "Closest chargers (widened search):",
                ...closest.map(
                  (x, i) =>
                    `${i + 1}. ${x.s.name} — ${x.s.address || x.s.postcode || ""} — ~${x.d.toFixed(1)} km`
                ),
              ]
            : []),
          "Tip: Prefer sites with multiple stalls and keep a backup within 10–15 minutes.",
        ],
        recommended_next_step: "Open EV Charger Finder to view on map and get directions.",
      },
      actions: [
        { label: "Open EV Charger Finder", href: postcode ? `https://ev.autodun.com/?postcode=${encodeURIComponent(postcode)}` : `https://ev.autodun.com/`, type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_no_nearby"] },
    };
  }

  return {
    status: "ok",
    intent: "ev_charging_readiness",
    sections: {
      understanding: `EV charging options near ${whereLabel}.`,
      analysis: [
        "Top chargers near your postcode:",
        ...nearby.map((x, i) => {
          const cs = (x.s.connectors || [])
            .slice(0, 2)
            .map((c) => c.type)
            .filter(Boolean)
            .join(", ");
          const tail = cs ? ` — ${cs}` : "";
          const where = x.s.address || x.s.postcode || "";
          return `${i + 1}. ${x.s.name} — ${where}${tail} (~${x.d.toFixed(1)} km)`;
        }),
        "Tip: Prefer sites with multiple stalls and keep a backup within 10–15 minutes.",
      ],
      recommended_next_step: "Open EV Charger Finder to view on map and get directions.",
    },
    actions: [
      { label: "Open EV Charger Finder", href: postcode ? `https://ev.autodun.com/?postcode=${encodeURIComponent(postcode)}` : `https://ev.autodun.com/`, type: "primary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_ok"] },
  };
}

/* =======================
   Response Helpers
======================= */

function makeOOS(id: string, tool_calls: AgentResponse["meta"]["tool_calls"]): AgentResponse {
  return {
    status: "out_of_scope",
    intent: "unknown_out_of_scope",
    sections: {
      understanding: "This request is outside the current Autodun AI Assistant scope.",
      analysis: ["Supported workflow here: MOT Intelligence (Layered).", "Try: “MOT for ML58FOU”."],
      recommended_next_step: "Send your VRM (example: ML58FOU) to generate MOT Intelligence.",
    },
    actions: [
      { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: {
      request_id: id,
      tool_calls,
      version: MOT_INTELLIGENCE_VERSION,
      layers: ["L1_intent", "L2_extract", "L3_fetch", "L4_parse", "L5_score", "L6_decide", "L7_synth"],
    },
  };
}

function makeNeedsClarification(
  id: string,
  intent: AgentIntent,
  tool_calls: AgentResponse["meta"]["tool_calls"]
): AgentResponse {
  return {
    status: "needs_clarification",
    intent,
    sections: {
      understanding: "I can run MOT Intelligence, but I need your VRM.",
      analysis: ["Example: “MOT for ML58FOU”", "Tip: You can paste the VRM only."],
      recommended_next_step: "Reply with your VRM (example: ML58FOU).",
    },
    actions: [
      { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: {
      request_id: id,
      tool_calls,
      version: MOT_INTELLIGENCE_VERSION,
      layers: ["L1_intent", "L2_extract", "L3_fetch", "L4_parse", "L5_score", "L6_decide", "L7_synth"],
    },
  };
}

/* =======================
   Handler
======================= */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = requestId();

  if (req.method !== "POST") {
    const out: AgentResponse = {
      status: "error",
      intent: "unknown_out_of_scope",
      sections: {
        understanding: "Method not allowed.",
        analysis: ["Use POST with { text: \"MOT for ML58FOU\" }."],
        recommended_next_step: "Send a POST request.",
      },
      actions: [{ label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" }],
      meta: { request_id: id, tool_calls: [], version: MOT_INTELLIGENCE_VERSION },
    };
    return res.status(405).json(out);
  }

  const raw = req.body;
  const text = (typeof raw === "string" ? raw : typeof raw?.text === "string" ? raw.text : "")
    .toString()
    .trim();

  const intent = classifyIntent(text);
  const tool_calls: AgentResponse["meta"]["tool_calls"] = [];

  /* =======================
     ✅ EV SUPPORT (minimal)
     (FIXED: return AgentResponse directly)
  ======================= */

  if (intent === "ev_charging_readiness") {
    try {
      const out = await tool_get_ev_chargers_near_postcode(text, id, tool_calls);
      return res.status(200).json(out);
    } catch (e: any) {
      const out: AgentResponse = {
        status: "error",
        intent,
        sections: {
          understanding: "Could not fetch EV chargers.",
          analysis: [`Debug hint: ${String(e?.message || e || "unknown error")}`],
          recommended_next_step: "Try again, or verify the EV stations feed is reachable.",
        },
        actions: [
          { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: {
          request_id: id,
          tool_calls,
          version: MOT_INTELLIGENCE_VERSION,
          layers: ["EV_intent", "EV_error"],
        },
      };
      return res.status(200).json(out);
    }
  }

  // Keep used-car out-of-scope for now
  if (intent !== "mot_preparation") {
    return res.status(200).json(makeOOS(id, tool_calls));
  }

  /* =======================
     ✅ MOT FLOW (unchanged)
  ======================= */

  if (text.length < 2 || text.length > 800) {
    return res.status(200).json(makeNeedsClarification(id, intent, tool_calls));
  }

  const vrm = extractVRM(text);

  if (!vrm) {
    const age = extractAgeYears(text);
    const miles = extractMileage(text);

    if (age !== null || miles !== null) {
      return res.status(200).json(makeMotChecklistFallback(id, tool_calls, age, miles));
    }

    return res.status(200).json(makeNeedsClarification(id, intent, tool_calls));
  }

  try {
    const t0 = Date.now();
    const intel = await tool_get_mot_intelligence_v3(vrm);
    tool_calls.push({ name: "mot_history", ok: true, ms: Date.now() - t0 });

    const layer7 = buildLayer7({
      vrm,
      vehicle: { ageYears: intel.vehicle.ageYears, mileage: intel.vehicle.mileage },
      risk: intel.risk,
      readiness: intel.readiness,
      timeline: intel.timeline,
      cost: intel.cost,
      ownership: intel.ownership,
    });

    const out: AgentResponse = {
      status: "ok",
      intent,
      sections: {
        understanding: `MOT Intelligence (Layers 1–7) for ${vrm}. ${layer7.headline}`,
        analysis: [
          ...layer7.summaryLines,
          "Action plan:",
          ...layer7.actionLines.map((x) => `• ${x}`),
          ...(intel.cost.breakdown.length
            ? [
                "Cost breakdown (Fix NOW items):",
                ...intel.cost.breakdown.map((b) => `• ${b.theme}: ${b.range}`),
              ]
            : []),
        ],
        recommended_next_step: layer7.recommendedNextStep,
      },
      actions: [
        {
          label: "Open MOT Predictor",
          href: `https://mot.autodun.com/?vrm=${encodeURIComponent(vrm)}`,
          type: "primary",
        },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: {
        request_id: id,
        tool_calls,
        version: MOT_INTELLIGENCE_VERSION,
        layers: [
          "L1_risk_scoring",
          "L2_fix_monitor",
          "L3_cost",
          "L4_readiness",
          "L5_timeline",
          "L6_ownership",
          "L7_synthesis",
        ],
      },
    };

    return res.status(200).json(out);
  } catch (e: any) {
    const out: AgentResponse = {
      status: "error",
      intent,
      sections: {
        understanding: "We could not complete MOT Intelligence.",
        analysis: [
          "A temporary error occurred while running the layered engine.",
          `Debug hint: ${String(e?.message || e || "unknown error")}`,
        ],
        recommended_next_step:
          "Try again in a moment. If it persists, verify the MOT history API endpoint is reachable.",
      },
      actions: [
        { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: {
        request_id: id,
        tool_calls,
        version: MOT_INTELLIGENCE_VERSION,
        layers: [
          "L1_risk_scoring",
          "L2_fix_monitor",
          "L3_cost",
          "L4_readiness",
          "L5_timeline",
          "L6_ownership",
          "L7_synthesis",
        ],
      },
    };
    return res.status(200).json(out);
  }
}
