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

// --- Intent classification (simple v1, deterministic) ---
function classifyIntent(text: string): AgentIntent {
  const t = text.toLowerCase();

  const mot = ["mot", "fail", "test", "advisory", "mileage", "miles", "years old", "emission", "brake"];
  const ev = ["ev", "charge", "charging", "charger", "ccs", "type 2", "chademo", "rapid"];
  const used = ["buy", "buying", "used car", "second hand", "purchase", "seller", "inspection"];

  const motScore = mot.filter((k) => t.includes(k)).length;
  const evScore = ev.filter((k) => t.includes(k)).length;
  const usedScore = used.filter((k) => t.includes(k)).length;

  if (motScore === 0 && evScore === 0 && usedScore === 0) return "unknown_out_of_scope";
  if (motScore >= evScore && motScore >= usedScore) return "mot_preparation";
  if (evScore >= motScore && evScore >= usedScore) return "ev_charging_readiness";
  return "used_car_buyer";
}

function extractAgeYears(text: string): number | null {
  // Matches: "10 years old", "10 year old", "10 yrs old"
  const m = text.toLowerCase().match(/(\d{1,2})\s*(years|year|yrs|yr)\s*old/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function extractMileage(text: string): number | null {
  // Matches: "120k miles", "120000 miles", "120,000"
  const t = text.toLowerCase().replace(/,/g, "");
  const k = t.match(/(\d{2,3})\s*k\s*miles/);
  if (k) return parseInt(k[1], 10) * 1000;

  const m = t.match(/(\d{4,6})\s*miles/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

// --- v1 Tools (heuristics only, stable contracts) ---
async function tool_get_mot_risk_summary(input: { vehicle_age_years?: number; mileage?: number }) {
  const age = input.vehicle_age_years ?? null;
  const miles = input.mileage ?? null;

  let risk: "LOW" | "MEDIUM" | "HIGHER" = "MEDIUM";
  if ((age !== null && age >= 12) || (miles !== null && miles >= 120000)) risk = "HIGHER";
  if ((age !== null && age <= 4) && (miles !== null && miles <= 40000)) risk = "LOW";

  const drivers: string[] = [];
  drivers.push(
    age !== null
      ? `Vehicle age (${age} years) increases probability of wear-related advisories.`
      : "Vehicle age increases probability of wear-related advisories."
  );
  drivers.push(
    miles !== null
      ? `Mileage (${miles.toLocaleString()} miles) correlates with wear on brakes, suspension, and tyres.`
      : "Mileage correlates with wear on brakes, suspension, and tyres."
  );

  const checklist = [
    "Brakes: pads/discs, brake fluid, handbrake effectiveness",
    "Suspension/steering: bushes, shocks, ball joints",
    "Tyres: tread depth, sidewall damage, alignment",
    "Lights & visibility: bulbs, lenses, wipers, washer fluid",
    "Emissions readiness: warning lights, service history"
  ];

  return { risk_band: risk, drivers, checklist };
}

async function tool_get_ev_charging_context(input: { location_text?: string }) {
  const loc = (input.location_text || "").trim() || "your area";
  return {
    summary_points: [
      `Charging readiness depends on density, reliability, and backup options around ${loc}.`,
      "Rapid charging is commonly CCS on many modern EVs; Type 2 is common for AC charging."
    ],
    recommended_strategy: [
      "Prefer sites with multiple stalls and at least one backup nearby.",
      "Plan around reliable networks and keep a fallback option within 10–15 minutes."
    ],
    suggested_connectors: ["CCS", "Type 2"]
  };
}

async function tool_get_used_car_buyer_checklist() {
  return {
    must_check: [
      "MOT history pattern: repeated advisories/fails in the same area",
      "Service evidence: major interval items where applicable",
      "Tyres/brakes/suspension condition",
      "Warning lights and (if possible) an OBD scan",
      "Body/underside corrosion and accident signs"
    ],
    red_flags: [
      "Seller avoids V5C, receipts, or clear history",
      "Mileage story does not match wear",
      "Repeated advisories with no evidence of repair"
    ]
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<AgentResponse | any>) {
  const id = requestId();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const text = String(req.body?.text || "").trim();
  if (text.length < 8 || text.length > 800) {
    return res.status(400).json({ error: "Invalid text length" });
  }

  const intent = classifyIntent(text);
  const tool_calls: AgentResponse["meta"]["tool_calls"] = [];

  try {
    // OUT OF SCOPE
    if (intent === "unknown_out_of_scope") {
      const out: AgentResponse = {
        status: "out_of_scope",
        intent,
        sections: {
          understanding: "You asked for something outside the current Autodun AI Assistant v1 scope.",
          analysis: ["This v1 supports: MOT preparation, EV charging readiness, and used-car buying checks."],
          recommended_next_step: "Choose one of the supported workflows below."
        },
        actions: [
          { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
          { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" }
        ],
        meta: { request_id: id, tool_calls }
      };
      return res.status(200).json(out);
    }

    // MOT FLOW
    if (intent === "mot_preparation") {
      const age = extractAgeYears(text);
      const miles = extractMileage(text);

      // One-clarification rule: if both missing
      if (age === null && miles === null) {
        const out: AgentResponse = {
          status: "needs_clarification",
          intent,
          sections: {
            understanding: "You want MOT risk guidance, but key details are missing.",
            analysis: ["Age and mileage strongly influence wear-related advisories and risk banding."],
            recommended_next_step: "Please share your vehicle age (years) and approximate mileage."
          },
          actions: [
            { label: "Open MOT Predictor anyway", href: "https://mot.autodun.com/", type: "primary" },
            { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" }
          ],
          meta: { request_id: id, tool_calls }
        };
        return res.status(200).json(out);
      }

      const t0 = Date.now();
      const mot = await tool_get_mot_risk_summary({
        vehicle_age_years: age ?? undefined,
        mileage: miles ?? undefined
      });
      tool_calls.push({ name: "get_mot_risk_summary", ok: true, ms: Date.now() - t0 });

      const out: AgentResponse = {
        status: "ok",
        intent,
        sections: {
          understanding: "You want to understand MOT risk and how to prepare based on vehicle condition signals.",
          analysis: [
            `Risk band: ${mot.risk_band}.`,
            ...mot.drivers,
            "Preparation is most effective when you check common failure areas before the test."
          ],
          recommended_next_step: "Open MOT Predictor to run a personalised estimate and review next actions."
        },
        actions: [{ label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" }],
        meta: { request_id: id, tool_calls }
      };
      return res.status(200).json(out);
    }

    // EV FLOW
    if (intent === "ev_charging_readiness") {
      const t0 = Date.now();
      const ev = await tool_get_ev_charging_context({ location_text: "" });
      tool_calls.push({ name: "get_ev_charging_context", ok: true, ms: Date.now() - t0 });

      const out: AgentResponse = {
        status: "ok",
        intent,
        sections: {
          understanding: "You want to understand EV charging readiness and how to plan charging near you.",
          analysis: [...ev.summary_points, ...ev.recommended_strategy],
          recommended_next_step: "Open EV Charger Finder to explore chargers near you and plan a reliable route."
        },
        actions: [{ label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" }],
        meta: { request_id: id, tool_calls }
      };
      return res.status(200).json(out);
    }

    // USED CAR FLOW
    const t0 = Date.now();
    const used = await tool_get_used_car_buyer_checklist();
    tool_calls.push({ name: "get_used_car_buyer_checklist", ok: true, ms: Date.now() - t0 });

    const out: AgentResponse = {
      status: "ok",
      intent: "used_car_buyer",
      sections: {
        understanding: "You want a structured checklist to reduce risk when buying a used car.",
        analysis: [
          ...used.must_check.slice(0, 4),
          ...used.red_flags.slice(0, 2),
          "MOT history patterns are one of the fastest ways to identify recurring issues."
        ],
        recommended_next_step: "Check MOT history via Autodun MOT Predictor before committing to purchase."
      },
      actions: [{ label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" }],
      meta: { request_id: id, tool_calls }
    };
    return res.status(200).json(out);
  } catch (e: any) {
    const out: AgentResponse = {
      status: "error",
      intent,
      sections: {
        understanding: "We could not complete the analysis.",
        analysis: ["A temporary error occurred while running the agent."],
        recommended_next_step: "Please try again."
      },
      actions: [
        { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" }
      ],
      meta: { request_id: id, tool_calls }
    };
    return res.status(500).json(out);
  }
}
