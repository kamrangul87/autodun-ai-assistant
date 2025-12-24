export type AgentIntent =
  | "mot_preparation"
  | "ev_charging_readiness"
  | "used_car_buyer"
  | "unknown";

export type AgentDecision = {
  intent: AgentIntent;
  confidence: number; // 0–1
  missing: string[];
  rationale: string[];
  route: { label: string; href: string } | null;
};

export function decideIntent(input: string): AgentDecision {
  const text = (input || "").toLowerCase().trim();

  // Signals
  const motSignals = ["mot", "fail", "advisory", "pass", "mileage", "odometer"];
  const evSignals = ["ev", "charge", "charging", "charger", "station", "plug", "connector"];
  const usedSignals = ["used car", "buying", "second hand", "secondhand", "purchase", "seller"];

  const hasMot = motSignals.some((s) => text.includes(s));
  const hasEv = evSignals.some((s) => text.includes(s));
  const hasUsed = usedSignals.some((s) => text.includes(s));

  // Helpers: detect age + mileage
  const hasAge = /\b\d+\s*(year|years|yr|yrs)\b/.test(text);
  const hasMileage = /\b\d{1,3}(?:,\d{3})?\s*(mile|miles|mi)\b/.test(text) || /\b\d{4,6}\b/.test(text);

  if (hasMot) {
    const missing: string[] = [];
    if (!hasAge) missing.push("vehicle age (years)");
    if (!hasMileage) missing.push("mileage (miles)");

    return {
      intent: "mot_preparation",
      confidence: 0.9,
      missing,
      rationale: [
        "You referenced MOT risk / passing / failing",
        "Age and mileage are the primary drivers of wear-related failure risk and advisories",
      ],
      // IMPORTANT: set this to your MOT Predictor URL (your subdomain or path)
      route: { label: "Open MOT Predictor", href: "https://mot.autodun.com" },
    };
  }

  if (hasEv) {
    return {
      intent: "ev_charging_readiness",
      confidence: 0.85,
      missing: ["your location / postcode", "connector type (optional)"],
      rationale: [
        "You referenced EV charging",
        "Location determines nearby availability and practical charging options",
      ],
      // IMPORTANT: set this to your EV Finder URL (your subdomain or path)
      route: { label: "Open EV Charger Finder", href: "https://ev.autodun.com" },
    };
  }

  if (hasUsed) {
    return {
      intent: "used_car_buyer",
      confidence: 0.8,
      missing: ["car make/model (optional)", "budget (optional)"],
      rationale: [
        "You’re evaluating a used car purchase",
        "MOT history + advisories + owner checks reduce purchase risk",
      ],
      route: { label: "Check MOT History", href: "https://mot.autodun.com" },
    };
  }

  return {
    intent: "unknown",
    confidence: 0.45,
    missing: ["a clear goal (MOT, EV charging, or used car buying)"],
    rationale: ["No strong domain signal detected from your message"],
    route: null,
  };
}
