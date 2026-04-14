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
  | "roadside_advice"
  | "general_car_advice"
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

function detectAllIntents(text: string): AgentIntent[] {
  const t = (text || "").toLowerCase();

  // Truly off-topic — only block things that have nothing to do with cars/driving
  if (
    ["visa", "bitcoin", "immigration", "cryptocurrency", "recipe", "cooking", "football result", "election"].some(
      (k) => t.includes(k)
    )
  ) {
    return ["unknown_out_of_scope"];
  }

  const found: AgentIntent[] = [];

  // EV CHARGING (location-based) — requires charging infrastructure keywords OR postcode/location
  // Deliberately excludes bare "\bev\b" so general EV questions route to general_car_advice
  const hasPostcode = /\b([a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2})\b/i.test(text || "");
  const evChargingKeywords =
    /(charger[s]?|charging\s*(?:station[s]?|point[s]?|near|in|at|around)|station[s]?\s*(?:near|in|at|around)|\bev\b\s*(?:near|in|at|around|charger|station)|type\s*2|ccs\b|chademo|rapid\s*charger|fast\s*charge|pod\s*point|bp\s*pulse)/i.test(
      text || ""
    );
  if (hasPostcode || evChargingKeywords) {
    found.push("ev_charging_readiness");
  }

  // ROADSIDE ADVICE
  const roadsideKeywords =
    /(burst.*tyre|tyre.*burst|flat\s*tyre|tyre.*flat|puncture|blowout|warning\s*light|dashboard\s*light|check\s*engine\s*light|breakdown|broken\s*down|stranded|engine.*overheat|overheating|oil\s*pressure|jump\s*start|spare\s*tyre|coolant\s*leak|radiator\s*leak)/i.test(
      text || ""
    );
  if (roadsideKeywords) {
    found.push("roadside_advice");
  }

  // MOT WITH VRM — full layered analysis (requires API)
  const hasVRM = /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/i.test(text || "");
  const ageOrMileage = extractAgeYears(text) !== null || extractMileage(text) !== null;
  if (hasVRM || ageOrMileage) {
    found.push("mot_preparation");
  }

  // GENERAL CAR ADVICE — covers used-car buying, maintenance, MOT advice, EV advice, car value
  // Anything car/vehicle/driving related that doesn't need live API data
  const generalCarKeywords =
    /(buy(?:ing)?|worth\s*buy|second[\s\-]?hand|used\s*car|pre[\s\-]?owned|hpi|cat\s*[sn]\b|v5\s*log|engine\s*light|check\s*engine|\bcel\b|oil\s*(?:change|level|type|grade)|change.*oil|\boil\b|service\s*(?:due|interval|history|light)?|servic(?:e|ing)\s*my|cambelt|timing\s*(?:belt|chain)|water\s*pump|grinding|squealing|squeaking|judder|knock(?:ing)?|rattl|clunk|vibrat|emission\w*|\bdpf\b|\begr\b|lambda|catalyst|mot\s*(?:fail|cost|price|test|prep|check|pass|history|expir)|how\s+much.*mot|pre[\s\-]?mot|before.*mot|switch.*(?:ev|electric)|should.*(?:ev|electric|\bev\b)|ev\s*(?:battery|range|car|advice|pros|cons)|\bev\b|electric\s*(?:car|vehicle|range|motoring)|range\s*anxiety|best\s*ev|cheap\s*ev|affordable\s*ev|depreciation|resale|sell.*car|best\s*time.*sell|car\s*value|brake\s*(?:pad|disc|fluid|noise|wear)|tyre\s*(?:pressure|wear|change|check)|clutch\b|gearbox|coolant|antifreeze|battery\s*(?:flat|drain|dead)|\baltermator\b|alternator|high\s*mileage|low\s*mileage|\bdiesel\b|\bpetrol\b|\bhybrid\b|car\s*maintenance|when.*service|how\s*often|worth\s*buy|is\s*it\s*worth|should\s*i\s*(?:buy|switch|get|fix)|noise.*(?:car|engine|brake|wheel)|what\s*causes|how\s*long.*(?:tyre|battery|clutch|brake|service)|reliable.*car|car.*reliable)/i.test(
      text || ""
    );
  if (generalCarKeywords) {
    found.push("general_car_advice");
  }

  // Default fallback: if nothing specific matched, use general_car_advice
  // (better UX than asking for a VRM for every unknown car query)
  if (!found.length) {
    return ["general_car_advice"];
  }

  return found;
}

/* =======================
   Extractors
======================= */

function extractVRM(text: string): string | null {
  const m = (text || "").toUpperCase().match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/);
  return m ? m[1].replace(/\s+/g, "") : null;
}

function extractAgeYears(text: string): number | null {
  const m = (text || "").toLowerCase().match(/(\d{1,2})\s*(years|year|yrs|yr)\s*old/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function extractMileage(text: string): number | null {
  const t = (text || "").toLowerCase().replace(/,/g, "");
  const k = t.match(/(\d{2,3})\s*k\s*miles/);
  if (k) return parseInt(k[1], 10) * 1000;

  const m = t.match(/(\d{4,6})\s*miles/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function extractPostcode(text: string): string | null {
  const m = (text || "").toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function extractPlaceName(text: string): string | null {
  const t = (text || "").trim();
  if (!t) return null;

  // Postcode takes priority
  if (extractPostcode(t)) return null;

  // Pattern 1: explicit preposition + place name (extended list)
  // Stop at punctuation OR conjunctions/possessives that signal a new clause
  // e.g. "near Ilford and my car..." → "Ilford", not "Ilford and my car..."
  const m1 = t.match(
    /\b(?:near|in|around|at|by|close\s+to|within|for)\s+([A-Za-z][A-Za-z\s\-']{2,50})/i
  );
  if (m1) {
    const cleaned = (m1[1] || "").trim()
      .split(/[.,;:!?]|\s+(?:and|or|but)\b|\s+(?:my|its|our|your|his|her)\s+/i)[0]
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 50) return cleaned;
  }

  // Pattern 2: "chargers/charging/stations PlaceName" (place name after EV service noun)
  // e.g. "EV chargers Ilford", "charging stations Manchester"
  // Trailing anchor: end-of-string, punctuation, OR conjunction
  const m2 = t.match(
    /\b(?:charger[s]?|charging|station[s]?|point[s]?)\s+([A-Za-z][A-Za-z\s\-']{2,40}?)(?:\s*$|\s*[?!.,]|\s+(?:and|or|but)\b)/i
  );
  if (m2) {
    const candidate = (m2[1] || "").trim();
    const notAPlace =
      /^(near|in|at|by|around|for|rapid|fast|slow|free|paid|nearby|local|available|open)\s*$/i;
    if (!notAPlace.test(candidate) && candidate.length >= 3) return candidate;
  }

  // Pattern 3: "PlaceName chargers/charging/ev" (place name before EV keyword)
  // e.g. "Manchester charging stations", "Ilford EV chargers"
  const m3 = t.match(
    /^([A-Za-z][A-Za-z\s\-']{2,40}?)\s+(?:charger[s]?|charging|station[s]?|\bev\b|electric)/i
  );
  if (m3) {
    const candidate = (m3[1] || "").trim();
    const notAPlace =
      /^(find|show|list|get|check|any|some|the|an?|nearby|local|rapid|fast)\s*$/i;
    if (!notAPlace.test(candidate) && candidate.length >= 3) return candidate;
  }

  // Pattern 4: short text (≤ 3 words) that looks like a standalone UK place name
  // e.g. "Ilford", "East London", "central Birmingham"
  const wordCount = t.split(/\s+/).length;
  if (wordCount <= 3 && /^[A-Za-z][A-Za-z\s\-']+$/.test(t)) {
    const notAPlace =
      /\b(charger|charging|ev|electric|mot|buy|sell|help|find|show|check|please|can|what|where|how|is|are|the|a|an)\b/i;
    if (!notAPlace.test(t) && t.length >= 3) return t;
  }

  return null;
}

/* =======================
   EV Helpers (minimal)
======================= */

function toNum(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function kmToMiles(km: number): number {
  return km * 0.621371;
}

/* =======================
   ✅ EV Reasoning & Follow-up (NEW)
======================= */

function stationConnectorCount(s: StationLike): number {
  const cs = Array.isArray(s.connectors) ? s.connectors : [];
  if (!cs.length) return 0;
  let total = 0;
  for (const c of cs) {
    const n = toNum((c as any)?.count) ?? 1;
    total += Math.max(1, Math.floor(n));
  }
  return total;
}

function stationMaxPowerKw(s: StationLike): number {
  const cs = Array.isArray(s.connectors) ? s.connectors : [];
  let max = 0;
  for (const c of cs) {
    const p = toNum((c as any)?.power_kw ?? (c as any)?.power);
    if (p != null && p > max) max = p;
  }
  return max;
}

function buildEvReasonLabels(
  nearby: Array<{ s: StationLike; dKm: number }>
): Array<{ reason: string; tags: string[] }> {
  if (!nearby.length) return [];

  const byDistance = [...nearby].sort((a, b) => a.dKm - b.dKm);
  const closestId = byDistance[0]?.s?.id ?? "closest";

  const byConnectors = [...nearby].sort(
    (a, b) => stationConnectorCount(b.s) - stationConnectorCount(a.s)
  );
  const mostConnectorsId = byConnectors[0]?.s?.id ?? "connectors";

  const byPower = [...nearby].sort((a, b) => stationMaxPowerKw(b.s) - stationMaxPowerKw(a.s));
  const topPowerId = byPower[0]?.s?.id ?? "power";
  const topPowerVal = stationMaxPowerKw(byPower[0]?.s || ({} as any));

  return nearby.map((x) => {
    const tags: string[] = [];
    if ((x.s.id ?? "") === closestId) tags.push("Closest option");

    const cc = stationConnectorCount(x.s);
    if ((x.s.id ?? "") === mostConnectorsId && cc > 1) tags.push(`More connectors (${cc})`);

    const p = stationMaxPowerKw(x.s);
    if ((x.s.id ?? "") === topPowerId && topPowerVal >= 22) tags.push(`Faster charging (${Math.round(topPowerVal)} kW)`);

    if (!tags.length) tags.push("Good backup choice");

    return { reason: tags[0], tags };
  });
}

function pickEvFollowUpQuestion(opts: {
  postcode: string | null;
  place: string | null;
  text: string;
  nearbyCount: number;
  hasHighPower: boolean;
}): string {
  const t = (opts.text || "").toLowerCase();

  if (/(rapid|fast|ccs|chademo|motorway|trip|journey)/i.test(t)) {
    return "Do you want the fastest charger (rapid) or the closest one?";
  }

  if (opts.hasHighPower) {
    return "Do you need rapid charging (fast) or standard charging (cheaper/longer stay)?";
  }

  if (opts.nearbyCount === 0) {
    return "Should I widen the search radius to 20 miles, or do you want to try a nearby postcode?";
  }

  return opts.postcode
    ? "Is this for daily local charging (home/work) or a one-off trip charge?"
    : "Do you prefer the closest charger, or a site with more connectors (better availability)?";
}

// ✅ signature: lat1,lng1,lat2,lng2
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

async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    return await geocodeUKPostcode(postcode);
  } catch {
    return null;
  }
}

// Nominatim (OpenStreetMap) — no API key, comprehensive UK coverage
async function geocodeViaNominatim(place: string): Promise<{ lat: number; lng: number } | null> {
  const q = (place || "").trim();
  if (!q) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ", UK")}&format=json&limit=1&countrycodes=gb`;
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Autodun-AI-Assistant/1.0 (https://ai.autodun.com)",
        "Accept-Language": "en",
      },
    });

    if (!r.ok) return null;

    const list = await r.json().catch(() => null);
    if (!Array.isArray(list) || !list.length) return null;

    const lat = toNum(list[0]?.lat);
    const lng = toNum(list[0]?.lon); // Nominatim uses "lon"
    if (lat == null || lng == null) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

// ✅ FIXED: places -> choose best result (prefer Greater London), retry with ", London" if ambiguous
async function geocodeUKPlace(place: string): Promise<{ lat: number; lng: number } | null> {
  const q = (place || "").trim();
  if (!q) return null;

  // Step 0: Nominatim — most reliable for UK towns/cities/areas (no API key needed)
  const nominatim = await geocodeViaNominatim(q);
  if (nominatim) return nominatim;

  function scorePlaceRow(p: any): number {
    const text = `${p?.name ?? ""} ${p?.region ?? ""} ${p?.admin_county ?? ""} ${p?.admin_district ?? ""} ${p?.country ?? ""}`.toLowerCase();
    let s = 0;

    if (text.includes("greater london")) s += 200;
    if (text.includes("london borough")) s += 150;
    if (text.includes("london")) s += 120;
    if (text.includes("england")) s += 10;

    return s;
  }

  function pickBest(list: any[]): { lat: number; lng: number } | null {
    if (!Array.isArray(list) || !list.length) return null;
    const ranked = [...list].sort((a, b) => scorePlaceRow(b) - scorePlaceRow(a));
    const best = ranked[0];

    const lat = toNum(best?.latitude);
    const lng = toNum(best?.longitude);
    if (lat == null || lng == null) return null;

    return { lat, lng };
  }

  // 1) Try places with more than 1 result
  try {
    const url = `https://api.postcodes.io/places?q=${encodeURIComponent(q)}&limit=10`;
    const r = await fetch(url, { method: "GET" });
    const j = await r.json().catch(() => null);

    const list = Array.isArray(j?.result) ? j.result : [];
    const best = pickBest(list);

    if (r.ok && best) {
      const ranked = [...list].sort((a, b) => scorePlaceRow(b) - scorePlaceRow(a));
      const top = ranked[0];
      const topText = `${top?.region ?? ""} ${top?.admin_county ?? ""} ${top?.admin_district ?? ""}`.toLowerCase();
      const londonLikely = topText.includes("london");
      if (londonLikely) return best;
      // else: fall through to retry with London hint
    }
  } catch {
    // ignore
  }

  // 2) Retry with explicit London hint (only if user didn't already type London)
  if (!/london/i.test(q)) {
    const q2 = `${q}, London`;
    try {
      const url = `https://api.postcodes.io/places?q=${encodeURIComponent(q2)}&limit=10`;
      const r = await fetch(url, { method: "GET" });
      const j = await r.json().catch(() => null);

      const list = Array.isArray(j?.result) ? j.result : [];
      const best = pickBest(list);
      if (r.ok && best) return best;
    } catch {
      // ignore
    }
  }

  // 3) Fallback: postcodes search
  try {
    const url2 = `https://api.postcodes.io/postcodes?q=${encodeURIComponent(q)}&limit=10`;
    const r2 = await fetch(url2, { method: "GET" });
    const j2 = await r2.json().catch(() => null);

    const list2 = Array.isArray(j2?.result) ? j2.result : [];
    if (r2.ok && list2.length) {
      const ranked2 = [...list2].sort((a, b) => {
        const ta = `${a?.admin_county ?? ""} ${a?.admin_district ?? ""} ${a?.region ?? ""}`.toLowerCase();
        const tb = `${b?.admin_county ?? ""} ${b?.admin_district ?? ""} ${b?.region ?? ""}`.toLowerCase();

        const sa =
          (ta.includes("greater london") ? 200 : 0) +
          (ta.includes("london") ? 120 : 0) +
          (ta.includes("england") ? 10 : 0);
        const sb =
          (tb.includes("greater london") ? 200 : 0) +
          (tb.includes("london") ? 120 : 0) +
          (tb.includes("england") ? 10 : 0);

        return sb - sa;
      });

      const best2 = ranked2[0];
      const lat2 = toNum(best2?.latitude);
      const lng2 = toNum(best2?.longitude);
      if (lat2 != null && lng2 != null) return { lat: lat2, lng: lng2 };
    }
  } catch {
    // ignore
  }

  return null;
}

type StationLike = {
  id?: string;
  name?: string;
  address?: string;
  postcode?: string;
  lat?: number | string;
  lng?: number | string;
  location?: { lat?: number | string; lng?: number | string };
  connectors?: Array<{ type?: string; power_kw?: number; power?: number; count?: number }>;
};

function stationLatLng(s: StationLike): { lat: number; lng: number } | null {
  const lat =
    toNum((s as any).lat) ??
    toNum((s as any).location?.lat) ??
    null;

  const lng =
    toNum((s as any).lng) ??
    toNum((s as any).location?.lng) ??
    null;

  if (lat == null || lng == null) return null;
  return { lat, lng };
}

/* =======================
   ✅ Supabase stations fetch (optional)
======================= */

async function fetchStationsFromSupabase(
  limit = 50000
): Promise<{ ok: boolean; stations: StationLike[]; error?: string }> {
  if (!EV_SUPABASE_URL || !EV_SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, stations: [], error: "Supabase env not set" };
  }

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
          .map((row): StationLike | null => {
            const lat = toNum(row?.lat);
            const lng = toNum(row?.lng);
            if (lat == null || lng == null) return null;

            const connectorsRaw = Array.isArray(row?.connectors)
              ? row.connectors
              : Array.isArray(row?.connectorsDetailed)
              ? row.connectorsDetailed
              : [];

            const connectors = Array.isArray(connectorsRaw)
              ? connectorsRaw.map((c: any) => {
                  const power = toNum(c?.power_kw ?? c?.powerKW ?? c?.power);
                  const count = toNum(c?.count ?? c?.quantity ?? 1);

                  return {
                    type: String(c?.type ?? "").trim(),
                    power_kw: power != null && power > 0 ? power : undefined,
                    count: count != null && count > 0 ? count : 1,
                  };
                })
              : undefined;

            return {
              id: String(row?.id ?? ""),
              name: String(row?.name ?? "Charging location"),
              address: String(row?.address ?? ""),
              postcode: String(row?.postcode ?? ""),
              lat,
              lng,
              connectors,
            };
          })
          .filter((s): s is StationLike => s !== null)
      : [];

    return { ok: true, stations };
  } catch (e: any) {
    return { ok: false, stations: [], error: String(e?.message || e || "unknown error") };
  }
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
    const recent = p.last_seen_year >= currentYear - 1;
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

/* =======================
   EV tool (fixed + improved outputs)
======================= */

function appendQuery(url: string, key: string, value: string) {
  const hasQ = url.includes("?");
  return `${url}${hasQ ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

async function fetchStationsFeed(
  tool_calls: AgentResponse["meta"]["tool_calls"],
  whereLabel: string | null
): Promise<any> {
  const t0 = Date.now();
  const r = await fetch(EV_FINDER_STATIONS_URL, { method: "GET" });
  tool_calls.push({ name: "ev_stations_feed", ok: r.ok, ms: Date.now() - t0 });
  if (r.ok) return await r.json();

  if (whereLabel) {
    const url2 = appendQuery(EV_FINDER_STATIONS_URL, "q", whereLabel);
    const t1 = Date.now();
    const r2 = await fetch(url2, { method: "GET" });
    tool_calls.push({ name: "ev_stations_feed_q", ok: r2.ok, ms: Date.now() - t1 });
    if (r2.ok) return await r2.json();
  }

  throw new Error(`Stations feed returned ${r.status}`);
}

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
        understanding:
          "You want EV charging options, but I need a UK postcode (or a UK place/city name) to find nearby chargers.",
        analysis: ["Example: “chargers near SW1A 1AA”", "Or: “chargers near Ilford”"],
        recommended_next_step: "Reply with your postcode (e.g., SW1A 1AA) or a place/city (e.g., Ilford, Manchester).",
      },
      actions: [
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_postcode_needed"] },
    };
  }

  const tGeo = Date.now();
  const geo = postcode ? await geocodePostcode(postcode) : await geocodeUKPlace(place || "");
  tool_calls.push({
    name: postcode ? "geocode_postcode" : "geocode_place",
    ok: !!geo,
    ms: Date.now() - tGeo,
  });

  if (!geo) {
    const locationHint = place
      ? `"${place}" could not be found — it may be misspelled or too ambiguous.`
      : postcode
      ? `Postcode "${postcode}" could not be located.`
      : "No recognisable UK location was found in your query.";
    return {
      status: "needs_clarification",
      intent: "ev_charging_readiness",
      sections: {
        understanding: "I need a clearer UK location to find nearby EV chargers.",
        analysis: [
          locationHint,
          'Try a town, city, or postcode — e.g. "chargers near Ilford", "EV in Manchester", or "SW1A 1AA".',
        ],
        recommended_next_step:
          "Which area or postcode are you looking for EV chargers near?",
      },
      actions: [
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_geocode_failed"] },
    };
  }

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
    raw = await fetchStationsFeed(tool_calls, whereLabel);
    usedSource = "feed";
  }

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
        toNum(props?.lat) ??
        toNum(props?.latitude) ??
        (Array.isArray(s?.geometry?.coordinates) ? toNum(s.geometry.coordinates[1]) : null);

      const lng =
        toNum(props?.lng) ??
        toNum(props?.lon) ??
        toNum(props?.longitude) ??
        (Array.isArray(s?.geometry?.coordinates) ? toNum(s.geometry.coordinates[0]) : null);

      if (lat == null || lng == null) return null;

      const connectorsDetailed = Array.isArray(props?.connectorsDetailed) ? props.connectorsDetailed : [];
      const connectorsLegacy = Array.isArray(props?.connectors) ? props.connectors : [];

      const connectors: StationLike["connectors"] =
        connectorsDetailed.length
          ? connectorsDetailed.map((c: any) => ({
              type: String(c?.type || ""),
              power_kw: toNum(c?.powerKW ?? c?.power_kw),
              count: toNum(c?.quantity ?? c?.count) ?? 1,
            }))
          : connectorsLegacy.map((c: any) => ({
              type: String(c?.type || ""),
              power_kw: toNum(c?.power_kw ?? c?.powerKW),
              count: toNum(c?.count ?? c?.quantity) ?? 1,
            }));

      return {
        id: String(props?.id ?? props?.station_id ?? props?.ID ?? ""),
        name: String(props?.name ?? props?.title ?? "Charging location"),
        address: String(props?.address ?? props?.location ?? ""),
        postcode: String(props?.postcode ?? props?.post_code ?? ""),
        connectors,
        lat,
        lng,
      } as StationLike;
    })
    .filter((s): s is StationLike => s !== null);

  if (!stations.length) {
    return {
      status: "ok",
      intent: "ev_charging_readiness",
      sections: {
        understanding: `EV charging options near ${whereLabel}.`,
        analysis: [
          `Stations source: ${usedSource}. Parsed 0 usable stations (lat/lng missing).`,
          "Tip: Open EV Finder and search manually.",
          `Question: ${pickEvFollowUpQuestion({ postcode, place, text, nearbyCount: 0, hasHighPower: false })}`,
        ],
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
    .map((s): { s: StationLike; dKm: number } | null => {
      const ll = stationLatLng(s);
      if (!ll) return null;
      const dKm = haversineKm(geo.lat, geo.lng, ll.lat, ll.lng);
      return { s, dKm };
    })
    .filter((x): x is { s: StationLike; dKm: number } => x !== null);

  const radiusMiles = 10;
  const radiusKm = radiusMiles / 0.621371;

  const nearby = scored
    .filter((x) => x.dKm <= radiusKm)
    .sort((a, b) => a.dKm - b.dKm)
    .slice(0, 5);

  if (!nearby.length) {
    const maxWidenMiles = 25;
    const maxWidenKm = maxWidenMiles / 0.621371;
    const widened = scored
      .filter((x) => x.dKm <= maxWidenKm)
      .sort((a, b) => a.dKm - b.dKm)
      .slice(0, 5);

    if (!widened.length) {
      // Nothing within 25 miles — be honest rather than showing far-away stations
      const locationName = whereLabel || "your location";
      return {
        status: "ok",
        intent: "ev_charging_readiness",
        sections: {
          understanding: `EV charging options near ${locationName}.`,
          analysis: [
            `No EV stations found near ${locationName} in our current database.`,
            "This may mean the area has limited coverage in our data — not necessarily that chargers don't exist.",
            "Use the full EV Finder map for complete, up-to-date coverage across the UK.",
          ],
          recommended_next_step:
            "Open EV Charger Finder for the full interactive map and complete UK coverage.",
        },
        actions: [
          {
            label: "Open EV Charger Finder",
            href: postcode
              ? `https://ev.autodun.com/?postcode=${encodeURIComponent(postcode)}`
              : `https://ev.autodun.com/`,
            type: "primary",
          },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: {
          request_id: id,
          tool_calls,
          version: MOT_INTELLIGENCE_VERSION,
          layers: ["EV_intent", "EV_none_within_25mi"],
        },
      };
    }

    return {
      status: "ok",
      intent: "ev_charging_readiness",
      sections: {
        understanding: `EV charging options near ${whereLabel}.`,
        analysis: [
          `No stations found within ${radiusMiles} miles — showing closest within ${maxWidenMiles} miles:`,
          ...widened.map((x, i) => {
            const where = x.s.address || x.s.postcode || "";
            const mi = kmToMiles(x.dKm);
            return `${i + 1}. ${x.s.name} — ${where} — ~${mi.toFixed(1)} mi`;
          }),
          "Tip: Prefer sites with multiple stalls and keep a backup option in mind.",
          `Question: ${pickEvFollowUpQuestion({ postcode, place, text, nearbyCount: widened.length, hasHighPower: false })}`,
        ],
        recommended_next_step: "Open EV Charger Finder to view on map and get directions.",
      },
      actions: [
        {
          label: "Open EV Charger Finder",
          href: postcode
            ? `https://ev.autodun.com/?postcode=${encodeURIComponent(postcode)}`
            : `https://ev.autodun.com/`,
          type: "primary",
        },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: {
        request_id: id,
        tool_calls,
        version: MOT_INTELLIGENCE_VERSION,
        layers: ["EV_intent", "EV_widened_search"],
      },
    };
  }

  const reasonLabels = buildEvReasonLabels(nearby);
  const hasHighPower = nearby.some((x) => stationMaxPowerKw(x.s) >= 22);
  const followUp = pickEvFollowUpQuestion({ postcode, place, text, nearbyCount: nearby.length, hasHighPower });

  return {
    status: "ok",
    intent: "ev_charging_readiness",
    sections: {
      understanding: `EV charging options near ${whereLabel}.`,
      analysis: [
        `Top chargers within ${radiusMiles} miles:`,
        ...nearby.map((x, i) => {
          const cs = (x.s.connectors || [])
            .slice(0, 2)
            .map((c) => String(c?.type ?? "").trim())
            .filter((t): t is string => t.length > 0)
            .join(", ");

          const tail = cs ? ` — ${cs}` : "";
          const where = x.s.address || x.s.postcode || "";
          const mi = kmToMiles(x.dKm);

          const reason = reasonLabels[i]?.reason ? `\n   Reason: ${reasonLabels[i].reason}` : "";
          return `${i + 1}. ${x.s.name} — ${where}${tail} (~${mi.toFixed(1)} mi)${reason}`;
        }),
        "Tip: Prefer sites with multiple stalls and keep a backup within 10–15 minutes.",
        `Question: ${followUp}`,
      ],
      recommended_next_step: "Open EV Charger Finder to view on map and get directions.",
    },
    actions: [
      { label: "Open EV Charger Finder", href: postcode ? `https://ev.autodun.com/?postcode=${encodeURIComponent(postcode)}` : `https://ev.autodun.com/`, type: "primary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_ok", "EV_reasoning", "EV_followup"] },
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
      understanding: "That topic is outside Autodun AI's scope.",
      analysis: [
        "Autodun AI covers: MOT checks, used car buying, car maintenance, EV advice, roadside guidance, and car value.",
        "Try asking: \"What causes MOT failures?\", \"Should I switch to an EV?\", or share your VRM for a full MOT report.",
      ],
      recommended_next_step: "Ask any car, MOT, or driving question and I'll help.",
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
   Roadside Advice
======================= */

function makeRoadsideAdvice(
  text: string,
  id: string,
  tool_calls: AgentResponse["meta"]["tool_calls"]
): AgentResponse {
  const analysis: string[] = [];
  let understanding = "Roadside situation detected.";
  const recommendedNextStep =
    "If unsafe: hazards on, pull over, call 999 (danger) or your breakdown cover.";

  if (/(burst.*tyre|tyre.*burst|flat.*tyre|tyre.*flat|puncture|blowout)/i.test(text)) {
    understanding = "Burst or flat tyre.";
    analysis.push(
      "BURST / FLAT TYRE — immediate steps:",
      "• Do NOT brake hard — ease off the accelerator and grip the wheel firmly",
      "• Steer straight; let the car slow naturally, then brake gently",
      "• Pull over at the next safe point — hard shoulder, lay-by, or side street",
      "• Switch on hazard lights immediately",
      "• Exit safely away from traffic; place warning triangle 45 m behind if safe",
      "• Fit the spare tyre if confident — otherwise call breakdown cover",
      "UK breakdown: AA 0800 887766 | RAC 0333 200 0999 | Green Flag 0800 00 1771",
      "Legal note: minimum tyre tread depth in the UK is 1.6 mm (MOT failure + fine if below)"
    );
  } else if (
    /(warning\s*light|dashboard\s*light|check\s*engine\s*light)/i.test(text)
  ) {
    understanding = "Dashboard warning light query.";
    analysis.push(
      "DASHBOARD WARNING LIGHTS — quick guide:",
      "• Red oil can: STOP immediately — continuing risks catastrophic engine damage",
      "• Red temperature gauge: STOP — engine overheating; do NOT open radiator cap when hot",
      "• Red battery: stop when safe — alternator or battery fault; turn off all non-essentials",
      "• Amber engine/ECU light: book a diagnostic scan soon; urgent if flashing",
      "• Amber ABS light: ABS is disabled but brakes still work — get checked before MOT",
      "• Amber airbag/SRS light: MOT failure if illuminated — book inspection",
      "• TPMS (tyre pressure): check and inflate tyres to correct pressure (door-sill label)",
      "Rule of thumb: Red = stop now. Amber = book soon. Green/Blue = informational."
    );
  } else if (
    /(breakdown|broken\s*down|stranded|won.t\s*start|not\s*starting|engine.*(won.t|not))/i.test(
      text
    )
  ) {
    understanding = "Breakdown or engine not starting.";
    analysis.push(
      "BREAKDOWN — immediate steps:",
      "• On motorway: pull onto hard shoulder, exit from passenger side, wait behind barrier",
      "• Switch on hazards; place warning triangle 45 m behind (NOT on a motorway)",
      "• Stay away from the vehicle if on a fast road",
      "WON'T START — quick checklist:",
      "• Battery flat? Check interior lights dim when turning key",
      "• Fuel? Ensure the gauge is above reserve",
      "• Immobiliser? Check key fob battery is not flat",
      "UK breakdown: AA 0800 887766 | RAC 0333 200 0999 | Green Flag 0800 00 1771",
      "Not a member? You can join on the spot (expect a higher call-out fee)."
    );
  } else if (/(overheating|overheat|coolant|radiator)/i.test(text)) {
    understanding = "Engine overheating.";
    analysis.push(
      "ENGINE OVERHEATING — immediate steps:",
      "• Stop as soon as safely possible — do NOT continue driving",
      "• Turn off air conditioning; turn heater to full heat (draws heat away from engine)",
      "• Let the engine cool for at least 30 minutes before touching the radiator cap",
      "• NEVER open a hot radiator cap — risk of severe burns from pressurised boiling coolant",
      "• When cool: check coolant level; top up with 50/50 antifreeze mix (water in an emergency)",
      "Common causes: coolant leak, broken water pump, failed thermostat, blown head gasket",
      "If coolant level is fine but car overheats repeatedly: book a cooling system check urgently"
    );
  } else if (/(oil\s*pressure|low\s*oil|oil\s*light)/i.test(text)) {
    understanding = "Oil pressure warning.";
    analysis.push(
      "OIL PRESSURE WARNING — immediate steps:",
      "• STOP the engine immediately — continuing risks catastrophic engine damage",
      "• Pull over safely and switch off; wait 5 minutes",
      "• Check oil level on the dipstick — if low, top up with the correct grade (owner's manual)",
      "• If oil level is fine but the light remains on: do NOT restart — call breakdown",
      "Note: the oil pressure warning light is NOT the same as the oil level light; both need prompt action"
    );
  } else if (/(jump\s*start|flat\s*battery|dead\s*battery)/i.test(text)) {
    understanding = "Flat battery / jump start.";
    analysis.push(
      "JUMP START — step by step:",
      "• Park the donor car nose-to-nose (or side by side) — engines off",
      "• Red cable: positive (+) on flat battery, then positive (+) on donor battery",
      "• Black cable: negative (-) on donor battery, then an unpainted metal earth on the flat car",
      "• Start donor car; run for 2 minutes, then attempt to start the flat car",
      "• If successful: keep engine running for 20–30 min to recharge",
      "• Remove cables in reverse order (black earth first, then black donor, then reds)",
      "Caution: never connect cables to an airbag or fuel system component — risk of fire"
    );
  } else {
    // Generic roadside
    understanding = "Roadside or driving situation detected.";
    analysis.push(
      "GENERAL ROADSIDE GUIDANCE:",
      "• If unsafe at any point: hazards on, pull over, call 999 (danger) or breakdown cover",
      "• Tyre problem: ease off accelerator, steer straight, pull over safely",
      "• Warning lights: Red = stop now; Amber = book an inspection soon",
      "• Breakdown: AA 0800 887766 | RAC 0333 200 0999 | Green Flag 0800 00 1771",
      "• Overheating: stop, cool down 30 min, never open a hot radiator cap",
      "Share more detail (e.g. 'burst tyre', 'engine warning light', 'broken down') for specific steps."
    );
  }

  return {
    status: "ok",
    intent: "roadside_advice",
    sections: {
      understanding,
      analysis,
      recommended_next_step: recommendedNextStep,
    },
    actions: [
      { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: {
      request_id: id,
      tool_calls,
      version: MOT_INTELLIGENCE_VERSION,
      layers: ["roadside_intent", "roadside_advice"],
    },
  };
}

/* =======================
   General Car Advice
======================= */

function makeGeneralCarAdvice(
  text: string,
  id: string,
  tool_calls: AgentResponse["meta"]["tool_calls"]
): AgentResponse {
  const t = (text || "").toLowerCase();
  const analysis: string[] = [];
  let understanding = "Car advice query.";
  let recommendedNextStep =
    "For a full vehicle history and MOT risk report, visit mot.autodun.com.";
  const actions: AgentAction[] = [
    { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
    { label: "Open EV Finder", href: "https://ev.autodun.com/", type: "secondary" },
  ];

  // ── Used car buying ────────────────────────────────────────────────────
  if (/(buy(?:ing)?|worth\s*buy|second[\s\-]?hand|used\s*car|pre[\s\-]?owned|hpi|cat\s*[sn]\b|v5\s*log)/i.test(t)) {
    understanding = "Used car buying advice.";
    const motFailMatch = text.match(/(\d+)\s*(?:mot\s*)?fail/i);
    const motFails = motFailMatch ? parseInt(motFailMatch[1], 10) : null;

    if (motFails !== null) {
      analysis.push(
        `${motFails} MOT ${motFails === 1 ? "failure" : "failures"} in the history:`,
        motFails >= 3
          ? "• 3+ failures is a significant red flag — recurring issues suggest chronic problems"
          : motFails === 2
          ? "• 2 failures is a caution flag — ask what failed and whether repairs were done properly"
          : "• 1 failure can be normal; ask what was repaired and get receipts",
        "• Check whether the same items kept failing (suspension, brakes, emissions = expensive)"
      );
    }
    analysis.push(
      "BEFORE BUYING ANY USED CAR — checklist:",
      "• Full MOT history — look for patterns, advisories, repeat failures (free at check.mot.gov.uk)",
      "• HPI check (~£20) — confirms no outstanding finance, not stolen, not a write-off",
      "• V5 logbook — verify keeper count, VIN, and colour match the car",
      "• Service history — FSH (full service history) is always worth paying a premium for",
      "• Pre-purchase inspection — a mobile mechanic inspection costs £100–200 and can save thousands",
      "• Test drive — listen for knocking, grinding, hesitation; check all electrics and air con",
      "UK NEGOTIATION:",
      "• Any MOT advisories = instant bargaining chips",
      "• 3+ MOT failures = negotiate £500–2,000 below asking depending on the issues",
      "• Check the MOT expiry date — imminent MOT = potential upcoming repair costs"
    );
    recommendedNextStep =
      "Run the VRM on our MOT Predictor for a full history and risk score before you buy.";

  // ── Engine light ───────────────────────────────────────────────────────
  } else if (/(engine\s*light|check\s*engine|\bcel\b)/i.test(t)) {
    understanding = "Engine warning light advice.";
    analysis.push(
      "ENGINE WARNING LIGHT — what it means:",
      "• Solid amber = issue detected, book a diagnostic scan soon (do not ignore)",
      "• Flashing amber = active misfire — reduce speed, avoid high revs, book urgently",
      "• Red engine light = stop safely, switch off, do not continue driving",
      "MOST COMMON CAUSES (DVSA data):",
      "• Loose/damaged fuel filler cap — check and tighten first (free fix)",
      "• Faulty oxygen (lambda) sensor — £100–300",
      "• Catalytic converter fault — £200–800",
      "• EGR valve (diesels especially) — £150–600",
      "• DPF blockage (diesel) — £100–300 for clean; £400–1,500 for replacement",
      "• Spark plugs / ignition coils — £80–250",
      "WHAT TO DO:",
      "• Get a diagnostic scan — most garages offer it for £40–60 or free with a repair booking",
      "• Do NOT clear the code without fixing the cause — it will return",
      "• If the light is flashing, do not drive at high revs; book same day"
    );
    recommendedNextStep = "Book a diagnostic scan — most garages can do same-day.";
    actions[0] = { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" };

  // ── Car noises ─────────────────────────────────────────────────────────
  } else if (/(grinding|squealing|squeaking|judder|knock(?:ing)?|rattl|clunk|vibrat|noise)/i.test(t)) {
    understanding = "Car noise or vibration.";
    if (/grind/i.test(t)) {
      analysis.push(
        "GRINDING NOISE — likely causes:",
        "• When braking: worn brake pads grinding on disc — URGENT, book immediately (£150–400)",
        "• When turning: worn CV joint or wheel bearing — book within 1 week (£200–500)",
        "• Continuous from engine bay: failing alternator, power steering pump, or AC compressor",
        "URGENCY: Grinding brakes are a safety issue — risk of brake failure. Do not delay."
      );
    } else if (/squeal|squeak/i.test(t)) {
      analysis.push(
        "SQUEALING / SQUEAKING — likely causes:",
        "• High-pitched squeal when braking: wear indicator telling you pads need replacing (£100–300)",
        "• Constant belt squeal from engine bay: drive belt slipping or worn (£80–200)",
        "• Squeak over bumps: worn suspension bushes or anti-roll drop links (£100–400)",
        "• Tyre squeal cornering: underinflated or worn tyres — check pressures first (free)"
      );
    } else if (/knock/i.test(t)) {
      analysis.push(
        "KNOCKING NOISE — likely causes:",
        "• Engine knock on acceleration: low oil pressure or worn bearings — STOP, check oil level now",
        "• Knock over bumps (suspension): worn ball joints, bushes, or drop links (£150–600)",
        "• Knock when turning: CV joint fault (£200–500) — book within 1–2 weeks"
      );
    } else if (/vibrat|judder/i.test(t)) {
      analysis.push(
        "VIBRATION / JUDDERING — likely causes:",
        "• When braking: warped brake discs — (£200–400 to replace)",
        "• At speed: wheel balancing or buckled wheel (£20–80 to balance)",
        "• Under acceleration: worn driveshaft CV joint (£200–500)",
        "• Through steering wheel: wheel alignment or loose wheel (£50 for alignment)"
      );
    } else {
      analysis.push(
        "UNUSUAL CAR NOISE — quick guide:",
        "• Grinding (brakes/turning): worn brakes or bearings — URGENT",
        "• Squealing: brake wear indicator or slipping belt — book soon",
        "• Knocking: engine/suspension issue — check oil, book inspection",
        "• Rattling: often loose heat shield or exhaust — typically minor",
        "• Clunking over bumps: anti-roll bar drop links (£80–300) — book soon",
        "Rule: any new persistent noise that gets worse = book an inspection promptly"
      );
    }
    recommendedNextStep = "Book a garage inspection — noises get more expensive the longer they are left.";

  // ── MOT general advice ─────────────────────────────────────────────────
  } else if (/(mot|roadworthy|advisory|defect)/i.test(t)) {
    understanding = "MOT advice.";
    if (/(cost|price|how\s*much)/i.test(t)) {
      analysis.push(
        "MOT COST IN THE UK (2026):",
        "• Government maximum fee: £54.85 for cars — no garage can legally charge more",
        "• Typical market price: £30–55 depending on garage and location",
        "• TIP: independent garages usually charge £30–45; dealers charge closer to the maximum",
        "• Free re-test: most garages offer a free re-test within 10 working days for items that failed",
        "• Book early — prices are often lower for off-peak slots (midweek mornings)"
      );
    } else if (/(emission|exhaust|smoke|dpf|diesel)/i.test(t)) {
      analysis.push(
        "MOT EMISSIONS FAILURE:",
        "PETROL: high CO or HC = unburnt fuel.",
        "• Causes: faulty lambda sensor, worn spark plugs, failing catalytic converter",
        "• Fix cost: plugs £80–150; lambda sensor £100–300; catalyst £200–800",
        "DIESEL: opacity (smoke) test failure.",
        "• Causes: blocked DPF, EGR fault, worn injectors",
        "• DPF clean: £100–300. DPF replacement: £400–1,500",
        "• EGR valve: £150–600",
        "TIP: warm the car fully before the MOT — a cold catalytic converter fails more easily"
      );
    } else if (/(fail|cause|common|what)/i.test(t)) {
      analysis.push(
        "MOST COMMON MOT FAILURE REASONS (DVSA data):",
        "1. Lights — blown bulbs, alignment, wiring (£5–50 to fix yourself)",
        "2. Suspension — worn bushes, ball joints, shock absorbers (£150–800)",
        "3. Brakes — worn pads/discs or hydraulic issue (£100–500)",
        "4. Tyres — below 1.6mm tread, sidewall damage (£80–400)",
        "5. Driver's view — windscreen cracks, worn wipers (£5–400)",
        "6. Emissions — especially older diesels (£100–1,500)",
        "7. Steering — excessive play (£100–600)",
        "PRE-MOT TIP: fix lights and tyres yourself before the test — cheapest items, biggest failure sources"
      );
    } else {
      analysis.push(
        "MOT — UK ESSENTIALS:",
        "• Required every year for cars over 3 years old",
        "• Tests: lights, brakes, steering, suspension, tyres, seatbelts, emissions, bodywork",
        "• Maximum fee: £54.85 (most charge £30–55)",
        "• Advisory = watch item, not yet a failure — fix before next MOT",
        "• PRE-MOT CHECKLIST: all lights working, tyres ≥1.6mm tread, no dashboard warning lights, windscreen clear",
        "• Check your full MOT history and upcoming risk at mot.autodun.com"
      );
    }
    recommendedNextStep =
      "Run your VRM on our MOT Predictor for a full failure risk assessment.";

  // ── Maintenance & service ──────────────────────────────────────────────
  } else if (/(service|cambelt|timing\s*(?:belt|chain)|oil\s*change|change.*oil|\boil\b|coolant|antifreeze|how\s*often|service\s*interval)/i.test(t)) {
    understanding = "Car maintenance advice.";
    if (/cambelt|timing\s*belt/i.test(t)) {
      analysis.push(
        "CAMBELT / TIMING BELT — critical service:",
        "• If the cambelt snaps while driving, the engine is usually destroyed (£3,000–5,000+ to rebuild)",
        "• Change interval: typically every 60,000–80,000 miles OR 5–8 years (whichever comes first)",
        "• Always replace the water pump at the same time — same labour cost, prevents a second job",
        "• Timing CHAINS are designed to last the engine life but can rattle on startup when worn",
        "COST: cambelt + water pump kit + labour = £400–800 (money very well spent)",
        "CHECK: search '[your make] [model] cambelt interval' for your exact schedule"
      );
    } else if (/oil/i.test(t)) {
      analysis.push(
        "ENGINE OIL — UK GUIDE:",
        "• Change interval: every 12 months or 10,000–12,000 miles (synthetic), 6,000 miles (older/high-mileage)",
        "• Check level: dipstick monthly, between MIN and MAX marks when engine is cold on level ground",
        "• Oil grade: use the exact grade in your owner's manual (e.g. 5W-30) — wrong grade damages seals",
        "• Low oil warning light: top up immediately and check for leaks",
        "• Cost: DIY oil change £30–60 in parts; garage service £80–200"
      );
    } else if (/service/i.test(t)) {
      analysis.push(
        "SERVICE INTERVALS — UK GUIDE:",
        "• Interim service (6 months / 6,000 miles): oil, oil filter, safety inspection — £80–150",
        "• Full service (12 months / 12,000 miles): + air filter, spark plugs, fuel filter, brake fluid — £150–300",
        "• Major service (24,000–36,000 miles): + cambelt, coolant, gearbox oil — £300–600",
        "TIP: use an independent VAT-registered garage — same quality as a dealer at 30–50% lower cost",
        "TIP: keeping a full service history (FSH) adds £500–2,000 to resale value"
      );
    } else {
      analysis.push(
        "KEY MAINTENANCE SCHEDULE (UK):",
        "• Engine oil: every 12 months or 10,000–12,000 miles",
        "• Brake fluid: every 2 years regardless of mileage",
        "• Coolant/antifreeze: every 5 years",
        "• Spark plugs: every 40,000 miles (standard) / 80,000 miles (iridium)",
        "• Cambelt: 60,000–80,000 miles or 5–8 years — CRITICAL",
        "• Air filter: every 20,000 miles or 2 years",
        "• Tyres: replace when tread reaches 3mm (legal minimum 1.6mm — fine + 3 points per tyre)"
      );
    }
    recommendedNextStep = "Share your VRM for a personalised MOT risk report at mot.autodun.com.";

  // ── EV general questions ───────────────────────────────────────────────
  } else if (/(switch.*(?:ev|electric)|should.*ev|\bev\b|electric\s*(?:car|vehicle)|ev\s*(?:battery|range|pros|cons)|range\s*anxiety|best\s*ev|cheap\s*ev)/i.test(t)) {
    understanding = "EV advice.";
    if (/(switch|should|worth)/i.test(t)) {
      analysis.push(
        "SHOULD I SWITCH TO AN EV? — UK HONEST GUIDE:",
        "SWITCH IF:",
        "• You have off-street parking (home charging is 3–5p/mile vs 40–60p/mile on rapid chargers)",
        "• Your daily driving is mostly under 150 miles",
        "• You qualify for workplace charging or cheap off-peak electricity (Economy 7/10)",
        "• You're a company car user — EVs have 2% BIK vs 30–37% for petrol/diesel",
        "WAIT IF:",
        "• You have no off-street parking and would rely entirely on public charging",
        "• You regularly do 300+ miles per day without charging options",
        "• You're buying a used EV without a battery health report",
        "UK CONTEXT:",
        "• No VED (road tax) for zero-emission cars",
        "• Running cost: ~3–5p/mile (home) vs ~12–18p/mile (petrol/diesel)",
        "• 60,000+ public charge points across the UK as of 2026",
        "VERDICT: for most UK urban/suburban drivers with home charging, EVs now make financial sense"
      );
    } else if (/(battery|range|anxiety|long|last)/i.test(t)) {
      analysis.push(
        "EV BATTERY & RANGE — UK GUIDE:",
        "• Battery lifespan: 10–15+ years in typical use; most EVs have 8-year / 100,000-mile warranty",
        "• Degradation: ~2–3% per year on average — a 5-year-old EV typically has 85–90% battery health",
        "• MAXIMISE RANGE:",
        "  - Charge to 80% daily (charge to 100% only before long journeys)",
        "  - Drive at 60–65mph on motorways (aerodynamic drag rises sharply above 70mph)",
        "  - Pre-condition the cabin while plugged in — saves battery energy",
        "• Home 7kW wallbox: ~30 miles of range per hour of charging",
        "• Public 50kW rapid: 80% charge in ~45–60 min depending on the car",
        "• Motorway 150kW ultra-rapid: 80% in ~20–30 min",
        "RANGE ANXIETY TIP: use Zap-Map (free app) to plan route charging in advance"
      );
    } else {
      analysis.push(
        "EV — UK OVERVIEW:",
        "• Running costs: ~3–5p/mile home-charged vs ~12–18p/mile for petrol/diesel",
        "• Lower servicing: no oil changes, regenerative braking reduces brake wear",
        "• Insurance: currently 10–20% higher than equivalent ICE — shop around",
        "• Charging network: 60,000+ public points across the UK (2026)",
        "• Best use case: regular urban/suburban driving with home charging",
        "• Depreciation: currently higher than petrol equivalents — buy nearly-new over brand new",
        "Use our EV Finder to locate chargers near you."
      );
    }
    recommendedNextStep = "Find EV chargers near you at ev.autodun.com.";
    actions[0] = { label: "Open EV Finder", href: "https://ev.autodun.com/", type: "primary" };
    actions[1] = { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" };

  // ── Car value & depreciation ───────────────────────────────────────────
  } else if (/(sell|depreciation|resale|car\s*value|best\s*time.*sell|colour.*(?:resale|value)|when.*sell)/i.test(t)) {
    understanding = "Car value and depreciation advice.";
    analysis.push(
      "WHEN IS THE BEST TIME TO SELL?",
      "• Spring/early summer: highest demand, best prices — avoid December/January",
      "• Before an expensive MOT or service becomes due (be transparent about it)",
      "• Before the car crosses 60,000 miles — values drop more sharply above this threshold",
      "• Just after a fresh MOT — buyers pay a premium for 12 months' peace of mind",
      "DEPRECIATION FACTS (UK):",
      "• Typical new car loses 15–35% in year 1, ~50% by year 3",
      "• Slowest-depreciating brands: Toyota, Suzuki, Mazda, Land Rover (Defender)",
      "• Fastest: luxury German cars on finance, some French/American models",
      "• EVs: currently depreciating faster than petrol equivalents (market uncertainty)",
      "COLOUR & RESALE VALUE:",
      "• Best colours: white, black, silver, grey — 90%+ of buyers accept these",
      "• Avoid unusual colours (yellow, orange, bright green) — 15–25% harder to sell",
      "• Red/blue: fine for hot hatches, risky for family cars",
      "WHERE TO SELL:",
      "• AutoTrader / Facebook Marketplace: best price, most effort",
      "• Part-exchange at dealer: convenient, typically £500–2,000 below market",
      "• Motorway / We Buy Any Car: quick, competitive offers for older/higher-mileage cars"
    );
    recommendedNextStep =
      "Check your car's MOT history to present a clean record to buyers at mot.autodun.com.";

  // ── Diesel/petrol/hybrid general ───────────────────────────────────────
  } else if (/(diesel|petrol|hybrid)/i.test(t)) {
    understanding = "Fuel type advice.";
    analysis.push(
      "PETROL vs DIESEL vs HYBRID — UK GUIDE:",
      "PETROL:",
      "• Best for: under 12,000 miles/year, mainly urban/short trips",
      "• Cheaper to buy and service; no DPF issues",
      "• Less fuel-efficient on motorways than diesel",
      "DIESEL:",
      "• Best for: 15,000+ miles/year with regular long journeys (motorway use keeps DPF clear)",
      "• Avoid if: mostly short urban trips — DPF blockage is very common (£400–1,500 to fix)",
      "• Low Emission Zones: diesel cars pre-Euro 6 face charges in many UK cities",
      "HYBRID (MHBS / FULL HYBRID):",
      "• Full hybrid (Toyota, Honda): great for urban, no plug required, lowest running cost for city driving",
      "• Plug-in hybrid (PHEV): good if you can charge at home and do mostly short trips",
      "• Mild hybrid: very minor benefit — mainly reduces strain on the engine",
      "VERDICT: Diesel is increasingly risky for UK city drivers due to ULEZ/LEZ charges. Hybrid is the safest all-round choice for mixed driving."
    );
    recommendedNextStep = "Check your car's MOT history and emissions compliance at mot.autodun.com.";

  // ── Generic car advice fallback ────────────────────────────────────────
  } else {
    understanding = "General vehicle query.";
    analysis.push(
      "I'm here to help with any car or vehicle question. Topics I cover:",
      "• MOT preparation — what fails, how much it costs, how to prepare",
      "• Used car buying — what to check, HPI, MOT history, negotiation",
      "• Car maintenance — oil changes, service intervals, cambelt, tyres",
      "• Warning lights and noises — causes, urgency, estimated costs",
      "• EV switching advice — is it right for you, range, charging costs",
      "• Car value & depreciation — when to sell, best colours, where to sell",
      "Share more detail about your specific situation and I'll give you practical advice."
    );
    recommendedNextStep =
      "Ask a specific question or share your VRM for a full MOT intelligence report.";
  }

  return {
    status: "ok",
    intent: "general_car_advice",
    sections: {
      understanding,
      analysis,
      recommended_next_step: recommendedNextStep,
    },
    actions,
    meta: {
      request_id: id,
      tool_calls,
      version: MOT_INTELLIGENCE_VERSION,
      layers: ["general_car_advice"],
    },
  };
}

/* =======================
   Multi-Intent Combiner
======================= */

function combineMultiIntentResponses(
  responses: AgentResponse[],
  id: string,
  tool_calls: AgentResponse["meta"]["tool_calls"]
): AgentResponse {
  const primary = responses[0];

  const intentLabel = (i: AgentIntent): string => {
    if (i === "ev_charging_readiness") return "EV Charging";
    if (i === "mot_preparation") return "MOT Intelligence";
    if (i === "roadside_advice") return "Roadside Advice";
    if (i === "general_car_advice") return "Car Advice";
    if (i === "used_car_buyer") return "Used Car";
    return "Analysis";
  };

  const combinedAnalysis: string[] = [];
  for (const r of responses) {
    combinedAnalysis.push(`--- ${intentLabel(r.intent)} ---`);
    combinedAnalysis.push(...r.sections.analysis);
  }

  const seenHrefs = new Set<string>();
  const combinedActions: AgentAction[] = [];
  for (const r of responses) {
    for (const a of r.actions) {
      if (!seenHrefs.has(a.href)) {
        seenHrefs.add(a.href);
        combinedActions.push(a);
      }
    }
  }

  const combinedNextStep = responses
    .map((r) => r.sections.recommended_next_step)
    .filter(Boolean)
    .join(" | ");

  const allLayers = responses.flatMap((r) => r.meta.layers ?? []);

  return {
    status: "ok",
    intent: primary.intent,
    sections: {
      understanding: `Multiple topics detected — answering ${responses.length} queries below.`,
      analysis: combinedAnalysis,
      recommended_next_step: combinedNextStep,
    },
    actions: combinedActions.slice(0, 4),
    meta: {
      request_id: id,
      tool_calls,
      version: MOT_INTELLIGENCE_VERSION,
      layers: ["multi_intent", ...allLayers],
    },
  };
}

/* =======================
   Handler
======================= */

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
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

  const intents = detectAllIntents(text);
  const tool_calls: AgentResponse["meta"]["tool_calls"] = [];

  // ── Single-intent fast path (existing behaviour preserved) ──────────────
  if (intents.length === 1) {
    const intent = intents[0];

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
          meta: { request_id: id, tool_calls, version: MOT_INTELLIGENCE_VERSION, layers: ["EV_intent", "EV_error"] },
        };
        return res.status(200).json(out);
      }
    }

    if (intent === "roadside_advice") {
      return res.status(200).json(makeRoadsideAdvice(text, id, tool_calls));
    }

    if (intent === "general_car_advice") {
      return res.status(200).json(makeGeneralCarAdvice(text, id, tool_calls));
    }

    if (intent === "unknown_out_of_scope") {
      return res.status(200).json(makeOOS(id, tool_calls));
    }

    if (intent !== "mot_preparation") {
      // used_car_buyer and any other unhandled intent → general car advice
      return res.status(200).json(makeGeneralCarAdvice(text, id, tool_calls));
    }

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

      // No VRM and no age/mileage — answer as a general car question rather than asking for VRM
      return res.status(200).json(makeGeneralCarAdvice(text, id, tool_calls));
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
              ? ["Cost breakdown (Fix NOW items):", ...intel.cost.breakdown.map((b) => `• ${b.theme}: ${b.range}`)]
              : []),
          ],
          recommended_next_step: layer7.recommendedNextStep,
        },
        actions: [
          { label: "Open MOT Predictor", href: `https://mot.autodun.com/?vrm=${encodeURIComponent(vrm)}`, type: "primary" },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: {
          request_id: id,
          tool_calls,
          version: MOT_INTELLIGENCE_VERSION,
          layers: ["L1_risk_scoring", "L2_fix_monitor", "L3_cost", "L4_readiness", "L5_timeline", "L6_ownership", "L7_synthesis"],
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
          layers: ["L1_risk_scoring", "L2_fix_monitor", "L3_cost", "L4_readiness", "L5_timeline", "L6_ownership", "L7_synthesis"],
        },
      };
      return res.status(200).json(out);
    }
  }

  // ── Multi-intent path — run each workflow and combine ───────────────────
  const responses: AgentResponse[] = [];
  const combinedToolCalls: AgentResponse["meta"]["tool_calls"] = [];

  for (const intent of intents) {
    if (intent === "ev_charging_readiness") {
      const evTc: AgentResponse["meta"]["tool_calls"] = [];
      try {
        const r = await tool_get_ev_chargers_near_postcode(text, id, evTc);
        responses.push(r);
      } catch { /* best-effort — skip failed EV lookup in multi-intent */ }
      combinedToolCalls.push(...evTc);

    } else if (intent === "roadside_advice") {
      const rtTc: AgentResponse["meta"]["tool_calls"] = [];
      responses.push(makeRoadsideAdvice(text, id, rtTc));

    } else if (intent === "mot_preparation") {
      const motTc: AgentResponse["meta"]["tool_calls"] = [];
      const vrm = extractVRM(text);
      if (vrm) {
        try {
          const t0 = Date.now();
          const intel = await tool_get_mot_intelligence_v3(vrm);
          motTc.push({ name: "mot_history", ok: true, ms: Date.now() - t0 });
          const layer7 = buildLayer7({
            vrm,
            vehicle: { ageYears: intel.vehicle.ageYears, mileage: intel.vehicle.mileage },
            risk: intel.risk,
            readiness: intel.readiness,
            timeline: intel.timeline,
            cost: intel.cost,
            ownership: intel.ownership,
          });
          responses.push({
            status: "ok",
            intent: "mot_preparation",
            sections: {
              understanding: `MOT Intelligence (Layers 1–7) for ${vrm}. ${layer7.headline}`,
              analysis: [
                ...layer7.summaryLines,
                "Action plan:",
                ...layer7.actionLines.map((x) => `• ${x}`),
                ...(intel.cost.breakdown.length
                  ? ["Cost breakdown (Fix NOW items):", ...intel.cost.breakdown.map((b) => `• ${b.theme}: ${b.range}`)]
                  : []),
              ],
              recommended_next_step: layer7.recommendedNextStep,
            },
            actions: [
              { label: "Open MOT Predictor", href: `https://mot.autodun.com/?vrm=${encodeURIComponent(vrm)}`, type: "primary" },
              { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
            ],
            meta: {
              request_id: id,
              tool_calls: motTc,
              version: MOT_INTELLIGENCE_VERSION,
              layers: ["L1_risk_scoring", "L2_fix_monitor", "L3_cost", "L4_readiness", "L5_timeline", "L6_ownership", "L7_synthesis"],
            },
          });
        } catch { /* best-effort */ }
      } else {
        const age = extractAgeYears(text);
        const miles = extractMileage(text);
        if (age !== null || miles !== null) {
          responses.push(makeMotChecklistFallback(id, motTc, age, miles));
        }
      }
      combinedToolCalls.push(...motTc);

    } else if (intent === "general_car_advice") {
      const gcTc: AgentResponse["meta"]["tool_calls"] = [];
      responses.push(makeGeneralCarAdvice(text, id, gcTc));
    }
    // unknown_out_of_scope / used_car_buyer: not included in combined output
  }

  if (!responses.length) {
    return res.status(200).json(makeOOS(id, combinedToolCalls));
  }
  if (responses.length === 1) {
    return res.status(200).json(responses[0]);
  }

  return res.status(200).json(combineMultiIntentResponses(responses, id, combinedToolCalls));
};

export default handler;
