import type { NextApiRequest, NextApiResponse } from "next";
import { getNearbyChargers } from "@/lib/tools/evFinder";

/* =======================
   Types & Helpers
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
  meta: { request_id: string; tool_calls: Array<{ name: string; ok: boolean; ms: number }> };
};

function requestId() {
  return "agt_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* =======================
   Intent Classification
======================= */

function classifyIntent(text: string): AgentIntent {
  const t = text.toLowerCase();

  const hardOOS = [
    "import","japan","customs","duty","vat","dvla registration","type approval",
    "shipping","container","auction","copart","insurance quote","finance","loan",
    "lease","visa","immigration","job","health","bitcoin",
  ];
  if (hardOOS.some((k) => t.includes(k))) return "unknown_out_of_scope";

  const mot = [
    "mot","fail","test","advisory","mileage","emission","brake","tyre",
    "suspension","warning light","engine light","vrm","registration",
  ];
  const ev = ["ev","electric","charge","charging","charger","postcode"];
  const used = ["buy","used car","service history","v5","hpi","cat"];

  const score = (arr: string[]) => arr.filter((k) => t.includes(k)).length;
  const motScore = score(mot), evScore = score(ev), usedScore = score(used);

  if (!motScore && !evScore && !usedScore) return "unknown_out_of_scope";
  if (motScore >= evScore && motScore >= usedScore) return "mot_preparation";
  if (evScore >= motScore && evScore >= usedScore) return "ev_charging_readiness";
  return "used_car_buyer";
}

/* =======================
   Extractors
======================= */

function extractVRM(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/);
  return m ? m[1].replace(/\s+/g, "") : null;
}

/* =======================
   MOT Intelligence
======================= */

type MotDefect = { dangerous?: boolean; text?: string; type?: string };
type MotTest = {
  completedDate?: string;
  expiryDate?: string;
  testResult?: string;
  odometerValue?: string;
  defects?: MotDefect[];
};
type MotHistory = {
  make?: string;
  model?: string;
  fuelType?: string;
  primaryColour?: string;
  firstUsedDate?: string;
  registrationDate?: string;
  motTests?: MotTest[];
};

/* 🔹 NEW: Pattern tracking type */
type ThemeYearStat = {
  first_seen: number;
  last_seen: number;
  count: number;
  years: number[];
};

const MOT_HISTORY_API_URL =
  process.env.MOT_PREDICTOR_API_URL || "https://mot.autodun.com/api/mot-history";

function yearsSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime())
    ? null
    : (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
}

/* =======================
   Theme Classifier (as-is)
======================= */

function themeFromText(t: string): string {
  const s = (t || "").toLowerCase();
  const has = (...k: string[]) => k.some((x) => s.includes(x));

  if (has("tyre","tread","sidewall")) return "tyres";
  if (has("suspension","bush","shock","arm")) return "suspension";
  if (has("brake","disc","pad","pipe")) return "brakes";
  if (has("exhaust","silencer","flexi")) return "exhaust";
  if (has("corrosion","rust","subframe")) return "corrosion";
  if (has("emission","lambda","dpf")) return "emissions";
  return "other";
}

/* =======================
   Risk Scoring
======================= */

type RiskBand = "LOW" | "MEDIUM" | "HIGH";
function scoreMotRisk(input: {
  ageYears?: number | null;
  mileage?: number | null;
  latestResult?: string | null;
  repeatThemes: Record<string, number>;
}): { score: number; band: RiskBand } {
  let score = 20;
  if (input.ageYears && input.ageYears >= 10) score += 15;
  if (input.mileage && input.mileage >= 120000) score += 15;
  if ((input.latestResult || "").includes("FAIL")) score += 20;
  score += Math.min(30, Object.values(input.repeatThemes).filter((n) => n >= 2).length * 5);
  score = Math.min(100, score);
  return { score, band: score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW" };
}

/* =======================
   MOT Intelligence v2 + Pattern Engine
======================= */

async function tool_get_mot_intelligence_v2(vrm: string) {
  const url = new URL(MOT_HISTORY_API_URL);
  url.searchParams.set("vrm", vrm);

  const r = await fetch(url.toString());
  if (!r.ok) throw new Error("MOT fetch failed");
  const data = (await r.json()) as MotHistory;

  const tests = data.motTests || [];
  const latest = tests[0] || {};

  const ageYears = yearsSince(data.firstUsedDate || data.registrationDate);

  const themeCounts: Record<string, number> = {};
  const themeYearStats: Record<string, ThemeYearStat> = {};

  for (const t of tests) {
    const year = t.completedDate ? new Date(t.completedDate).getFullYear() : null;
    for (const d of t.defects || []) {
      if (!d.text || !year) continue;
      const theme = themeFromText(d.text);
      themeCounts[theme] = (themeCounts[theme] || 0) + 1;

      if (!themeYearStats[theme]) {
        themeYearStats[theme] = {
          first_seen: year,
          last_seen: year,
          count: 1,
          years: [year],
        };
      } else {
        const s = themeYearStats[theme];
        s.count++;
        s.years.push(year);
        s.first_seen = Math.min(s.first_seen, year);
        s.last_seen = Math.max(s.last_seen, year);
      }
    }
  }

  /* 🔹 NEW: pattern analysis */
  const patterns = Object.entries(themeYearStats).map(([theme, s]) => {
    let trend: "worsening" | "stable" | "improving" = "stable";
    if (s.years.filter((y) => y >= new Date().getFullYear() - 1).length >= 2)
      trend = "worsening";
    if (s.last_seen < new Date().getFullYear() - 3)
      trend = "improving";
    return {
      theme,
      repeat_count: s.count,
      first_seen_year: s.first_seen,
      last_seen_year: s.last_seen,
      trend,
    };
  });

  const risk = scoreMotRisk({
    ageYears,
    mileage: Number(latest.odometerValue),
    latestResult: latest.testResult || "",
    repeatThemes: themeCounts,
  });

  return {
    vrm,
    latest,
    topThemes: Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([theme, count]) => ({ theme, count })),
    patterns,
    risk,
  };
}

/* =======================
   Handler
======================= */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = requestId();
  const text = String(req.body?.text || "");
  const intent = classifyIntent(text);
  const tool_calls: AgentResponse["meta"]["tool_calls"] = [];

  if (intent === "mot_preparation") {
    const vrm = extractVRM(text);
    if (!vrm) return res.status(200).json({ status: "needs_clarification" });

    const t0 = Date.now();
    const intel = await tool_get_mot_intelligence_v2(vrm);
    tool_calls.push({ name: "mot_history", ok: true, ms: Date.now() - t0 });

    return res.status(200).json({
      status: "ok",
      intent,
      sections: {
        understanding: `MOT intelligence for ${vrm}.`,
        analysis: [
          ...intel.patterns
            .filter((p) => p.repeat_count >= 3)
            .map(
              (p) =>
                `Pattern: ${p.theme} recurring since ${p.first_seen_year} (${p.trend}).`
            ),
          `Risk score: ${intel.risk.score}/100 (${intel.risk.band})`,
        ],
        recommended_next_step:
          "Fix worsening patterns before the next MOT test.",
      },
      actions: [{ label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" }],
      meta: { request_id: id, tool_calls },
    });
  }

  return res.status(200).json({ status: "out_of_scope" });
}
