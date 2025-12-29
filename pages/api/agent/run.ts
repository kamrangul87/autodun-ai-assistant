import type { NextApiRequest, NextApiResponse } from "next";
import { getNearbyChargers } from "@/lib/tools/evFinder";

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
  if (["visa","job","health","bitcoin"].some((k) => t.includes(k)))
    return "unknown_out_of_scope";
  if (["ev","charging","postcode"].some((k) => t.includes(k)))
    return "ev_charging_readiness";
  if (["buy","used","v5","hpi"].some((k) => t.includes(k)))
    return "used_car_buyer";
  return "mot_preparation";
}

/* =======================
   Extractors
======================= */

function extractVRM(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/);
  return m ? m[1].replace(/\s+/g, "") : null;
}

/* =======================
   MOT Types
======================= */

type MotDefect = { text?: string; type?: string };
type MotTest = {
  completedDate?: string;
  testResult?: string;
  odometerValue?: string;
  defects?: MotDefect[];
};
type MotHistory = {
  firstUsedDate?: string;
  registrationDate?: string;
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
  return Number.isNaN(dt.getTime())
    ? null
    : (Date.now() - dt.getTime()) / (365.25 * 24 * 3600 * 1000);
}

/* =======================
   Theme Classifier
======================= */

function themeFromText(t: string): string {
  const s = (t || "").toLowerCase();
  const has = (...k: string[]) => k.some((x) => s.includes(x));
  if (has("tyre","tread")) return "tyres";
  if (has("suspension","bush","shock")) return "suspension";
  if (has("brake","disc","pad")) return "brakes";
  if (has("exhaust","silencer","flexi")) return "exhaust";
  if (has("corrosion","rust","subframe")) return "corrosion";
  if (has("emission","lambda","dpf")) return "emissions";
  return "other";
}

/* =======================
   Risk Scoring
======================= */

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
   FIX vs IGNORE ENGINE (Layer-2)
======================= */

function decideFixOrIgnore(
  patterns: Array<{
    theme: string;
    repeat_count: number;
    last_seen_year: number;
    trend: "worsening" | "stable" | "improving";
  }>
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
      reason: "No strong evidence of worsening defects in recent MOTs",
    };
  });
}

/* =======================
   MOT Intelligence v2 + v3
======================= */

const MOT_HISTORY_API_URL =
  process.env.MOT_PREDICTOR_API_URL || "https://mot.autodun.com/api/mot-history";

async function tool_get_mot_intelligence_v2(vrm: string) {
  const r = await fetch(`${MOT_HISTORY_API_URL}?vrm=${vrm}`);
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

  const decisions = decideFixOrIgnore(patterns);

  const risk = scoreMotRisk({
    ageYears,
    mileage: Number(latest.odometerValue),
    latestResult: latest.testResult || "",
    repeatThemes: themeCounts,
  });

  return { vrm, patterns, decisions, risk };
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
          "Fix vs Monitor assessment:",
          ...intel.decisions
            .filter((d) => d.decision === "FIX")
            .map(
              (d) =>
                `FIX NOW: ${d.theme} — ${d.reason} (confidence: ${d.confidence}).`
            ),
          ...intel.decisions
            .filter((d) => d.decision === "MONITOR")
            .slice(0, 2)
            .map(
              (d) =>
                `Monitor: ${d.theme} — ${d.reason}.`
            ),
          `Risk score: ${intel.risk.score}/100 (${intel.risk.band})`,
        ],
        recommended_next_step:
          "Fix worsening items before the next MOT to reduce failure risk.",
      },
      actions: [{ label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" }],
      meta: { request_id: id, tool_calls },
    });
  }

  return res.status(200).json({ status: "out_of_scope" });
}
