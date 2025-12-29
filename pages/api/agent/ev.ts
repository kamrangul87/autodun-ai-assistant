// src/pages/api/agent/ev.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getNearbyChargers } from "@/lib/tools/evFinder";

type AgentStatus = "ok" | "needs_clarification" | "out_of_scope" | "error";
type AgentIntent = "ev_charging_readiness" | "unknown_out_of_scope";

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
 * UK postcode extractor
 * Handles: SW1A 1AA, SW1A1AA, punctuation, NBSP
 */
function extractPostcode(text: string): string | null {
  const cleaned = text
    .toUpperCase()
    .replace(/\u00A0/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const m = cleaned.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/);
  if (!m) return null;

  const raw = m[1].replace(/\s+/g, "");
  if (raw.length < 5) return null;

  return raw.slice(0, raw.length - 3) + " " + raw.slice(raw.length - 3);
}

function okResponse(id: string, postcode: string, lines: string[], tool_calls: AgentResponse["meta"]["tool_calls"]): AgentResponse {
  return {
    status: "ok",
    intent: "ev_charging_readiness",
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
}

function needsClarification(id: string, tool_calls: AgentResponse["meta"]["tool_calls"]): AgentResponse {
  return {
    status: "needs_clarification",
    intent: "ev_charging_readiness",
    sections: {
      understanding: "You want EV charging options near you.",
      analysis: ["Provide your UK postcode so I can find nearby chargers."],
      recommended_next_step: "Reply with a postcode (example: SW1A 1AA).",
    },
    actions: [
      { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
      { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
    ],
    meta: { request_id: id, tool_calls },
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = requestId();
  const tool_calls: AgentResponse["meta"]["tool_calls"] = [];

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const rawBody: any = req.body;
    const text =
      (typeof rawBody === "string" ? rawBody : typeof rawBody?.text === "string" ? rawBody.text : "")
        .toString()
        .trim();

    if (text.length < 3) {
      return res.status(200).json(needsClarification(id, tool_calls));
    }

    const postcode = extractPostcode(text);
    if (!postcode) {
      return res.status(200).json(needsClarification(id, tool_calls));
    }

    const t0 = Date.now();
    const stations = await getNearbyChargers({ postcode, radiusMiles: 10, limit: 5 });
    tool_calls.push({ name: "ev_finder_stations", ok: true, ms: Date.now() - t0 });

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
        : [
            `No stations were returned for ${postcode}.`,
            "Open EV Charger Finder to search on the map.",
          ];

    return res.status(200).json(okResponse(id, postcode, lines, tool_calls));
  } catch (e: any) {
    // IMPORTANT: always return JSON so the UI never crashes on r.json()
    return res.status(200).json({
      status: "error",
      intent: "unknown_out_of_scope",
      sections: {
        understanding: "EV analysis failed.",
        analysis: [`Debug hint: ${String(e?.message || e || "unknown error")}`],
        recommended_next_step: "Try again, or open EV Charger Finder directly.",
      },
      actions: [
        { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "primary" },
        { label: "Open AI Assistant", href: "/ai-assistant", type: "secondary" },
      ],
      meta: { request_id: id, tool_calls },
    });
  }
}
