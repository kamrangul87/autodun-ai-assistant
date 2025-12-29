// src/pages/api/agent/used.ts
import type { NextApiRequest, NextApiResponse } from "next";

type AgentStatus = "ok" | "needs_clarification" | "out_of_scope" | "error";
type AgentIntent = "used_car_buyer" | "unknown_out_of_scope";

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

// UK VRM extractor (simple)
function extractVRM(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/);
  if (!m) return null;
  return m[1].replace(/\s+/g, "");
}

function safeTextBody(body: any): string {
  const text =
    (typeof body === "string" ? body : typeof body?.text === "string" ? body.text : "")
      .toString()
      .trim();
  return text;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = requestId();
  const tool_calls: AgentResponse["meta"]["tool_calls"] = [];

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const text = safeTextBody(req.body);
    if (text.length < 3 || text.length > 800) {
      const out: AgentResponse = {
        status: "needs_clarification",
        intent: "used_car_buyer",
        sections: {
          understanding: "Tell me what you’re buying (and optionally the VRM).",
          analysis: [
            "Example prompts:",
            "• “I’m buying a used car — what should I check?”",
            "• “Buying ML58FOU — what should I check in MOT history?”",
          ],
          recommended_next_step: "Reply with what you’re buying (and VRM if you have it).",
        },
        actions: [
          { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
          { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
        ],
        meta: { request_id: id, tool_calls },
      };
      return res.status(200).json(out);
    }

    const vrm = extractVRM(text);

    // Core used-car checklist (no external calls, always stable)
    const mustCheck = [
      "V5C logbook: seller name/address matches ID; check VIN on car matches V5C.",
      "MOT pattern: repeated advisories/fails in same theme (brakes/tyres/suspension/corrosion).",
      "Service history: invoices + stamps; confirm major interval items where applicable.",
      "Cold start test: listen for knocks/rattles; check exhaust smoke and warning lights.",
      "Tyres/brakes/suspension: uneven tyre wear, brake vibration, clunks over bumps.",
      "Body/accident signs: mismatched paint, panel gaps, overspray, rust/corrosion underneath.",
      "Test drive: straight-line tracking, steering feel, braking, gearbox shifts, clutch bite.",
      "Electrics: windows, AC/heat, lights, infotainment, sensors, central locking.",
    ];

    const redFlags = [
      "Seller refuses viewing at home address or pushes for cash-only deal.",
      "Mileage story doesn’t match wear (steering wheel, pedals, seats).",
      "Fresh MOT right after multiple failures/advisories with no receipts.",
      "Oil/coolant contamination signs; persistent warning lights; overheating.",
    ];

    const negotiationTips = [
      "List repairs as line items and negotiate price based on realistic costs.",
      "If corrosion is recurring in MOT advisories, treat as a high-risk cost signal.",
      "If 2+ critical themes repeat across years, assume the problem wasn’t fixed properly.",
    ];

    const analysis: string[] = [
      "Must-check list:",
      ...mustCheck.slice(0, 8).map((x) => `• ${x}`),
      "Red flags:",
      ...redFlags.slice(0, 4).map((x) => `• ${x}`),
      "Negotiation tips:",
      ...negotiationTips.slice(0, 3).map((x) => `• ${x}`),
    ];

    const actions: AgentAction[] = [
      {
        label: vrm ? "Open MOT Predictor (VRM)" : "Open MOT Predictor",
        href: vrm ? `https://mot.autodun.com/?vrm=${encodeURIComponent(vrm)}` : "https://mot.autodun.com/",
        type: "primary",
      },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ];

    const out: AgentResponse = {
      status: "ok",
      intent: "used_car_buyer",
      sections: {
        understanding: vrm
          ? `Used-car buying checklist (VRM detected: ${vrm}).`
          : "Used-car buying checklist (no VRM provided).",
        analysis,
        recommended_next_step: vrm
          ? "Open MOT Predictor with the VRM and review repeat themes + failures before you pay a deposit."
          : "If you have the registration (VRM), send it to get a stronger MOT-based risk signal.",
      },
      actions,
      meta: { request_id: id, tool_calls },
    };

    return res.status(200).json(out);
  } catch (e: any) {
    // Always return JSON to prevent UI json() crashes
    return res.status(200).json({
      status: "error",
      intent: "unknown_out_of_scope",
      sections: {
        understanding: "Used-car analysis failed.",
        analysis: [`Debug hint: ${String(e?.message || e || "unknown error")}`],
        recommended_next_step: "Try again, or open MOT Predictor directly.",
      },
      actions: [
        { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls: [] },
    });
  }
}
