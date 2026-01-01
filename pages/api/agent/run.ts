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

/* =======================
   EV Helpers (minimal)
======================= */

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.asin(Math.sqrt(x));
}

async function geocodeUKPostcode(postcode: string) {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  const r = await fetch(url, { method: "GET" });
  const j = await r.json().catch(() => null);

  if (!r.ok || !j?.result?.latitude || !j?.result?.longitude) {
    const msg = j?.error || `Postcode lookup failed (${r.status})`;
    throw new Error(msg);
  }

  return { lat: Number(j.result.latitude), lng: Number(j.result.longitude) };
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

// ✅ EV tool: chargers near postcode
async function tool_get_ev_chargers_near_postcode(postcode: string) {
  const origin = await geocodeUKPostcode(postcode);

  const r = await fetch(EV_FINDER_STATIONS_URL, { method: "GET" });
  if (!r.ok) throw new Error(`Stations feed failed (${r.status})`);

  const raw = await r.json().catch(() => null);
  const list: StationLike[] = Array.isArray(raw) ? raw : Array.isArray(raw?.stations) ? raw.stations : [];

  if (!list.length) {
    return { origin, stations: [] as Array<{ s: StationLike; km: number }>, note: "Stations feed returned empty." };
  }

  const ranked = list
    .map((s) => {
      const ll = stationLatLng(s);
      if (!ll) return null;
      const km = haversineKm(origin, ll);
      return { s, km };
    })
    .filter(Boolean) as Array<{ s: StationLike; km: number }>;

  ranked.sort((a, b) => a.km - b.km);

  return { origin, stations: ranked.slice(0, 8) };
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
  ======================= */

  if (intent === "ev_charging_readiness") {
    const postcode = extractPostcode(text);

    if (!postcode) {
      const out: AgentResponse = {
        status: "needs_clarification",
        intent,
        sections: {
          understanding: "I can find EV chargers, but I need a UK postcode.",
          analysis: ["Example: “chargers near SW1A 1AA”", "Tip: paste a postcode like SW1A 1AA."],
          recommended_next_step: "Send your postcode to list nearby chargers.",
        },
        actions: [
          { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: {
          request_id: id,
          tool_calls,
          version: MOT_INTELLIGENCE_VERSION,
          layers: ["EV_intent", "EV_postcode_needed"],
        },
      };
      return res.status(200).json(out);
    }

    try {
      const t0 = Date.now();
      const ev = await tool_get_ev_chargers_near_postcode(postcode);
      tool_calls.push({ name: "ev_chargers_near_postcode", ok: true, ms: Date.now() - t0 });

      const items = ev.stations || [];
      const lines =
        items.length > 0
          ? items.map(({ s, km }, idx) => {
              const name = s.name || "Unknown site";
              const addr = s.address || s.postcode || "";
              return `${idx + 1}. ${name}${addr ? " — " + addr : ""} — ${km.toFixed(
                1
              )} km — ${connectorSummary(s)}`;
            })
          : ["No stations found in the feed for that area."];

      const out: AgentResponse = {
        status: "ok",
        intent,
        sections: {
          understanding: `EV charging options near ${postcode}.`,
          analysis: [
            `Top chargers near ${postcode}:`,
            ...lines,
            "Tip: Prefer sites with multiple stalls and keep a backup within 10–15 minutes.",
          ],
          recommended_next_step: "Open EV Charger Finder to view on map and get directions.",
        },
        actions: [
          {
            label: "Open EV Charger Finder",
            href: `https://ev.autodun.com/?postcode=${encodeURIComponent(postcode)}`,
            type: "primary",
          },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: {
          request_id: id,
          tool_calls,
          version: MOT_INTELLIGENCE_VERSION,
          layers: ["EV_intent", "EV_geocode", "EV_fetch_stations", "EV_rank"],
        },
      };

      return res.status(200).json(out);
    } catch (e: any) {
      tool_calls.push({ name: "ev_chargers_near_postcode", ok: false, ms: 0 });

      const out: AgentResponse = {
        status: "error",
        intent,
        sections: {
          understanding: `Could not fetch EV chargers for ${postcode}.`,
          analysis: [`Debug hint: ${String(e?.message || e || "unknown error")}`],
          recommended_next_step:
            "Try another postcode. If it persists, verify EV_FINDER_STATIONS_URL is reachable.",
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
