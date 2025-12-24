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
  route: {
    label: string;
    href: string;
  } | null;
};

export function decideIntent(input: string): AgentDecision {
  const text = input.toLowerCase();

  // Signals
  const motSignals = ["mot", "fail", "advisory", "pass"];
  const evSignals = ["ev", "charge", "charging", "station"];
  const usedSignals = ["used car", "buying", "second hand"];

  const hasMot = motSignals.some(s => text.includes(s));
  const hasEv = evSignals.some(s => text.includes(s));
  const hasUsed = usedSignals.some(s => text.includes(s));

  if (hasMot) {
    const missing: string[] = [];
    if (!/\b\d+\s*(year|years)\b/.test(text)) missing.push("vehicle age");
    if (!/\b\d{4,6}\s*(mile|miles|mi)\b/.test(text)) missing.push("mileage");

    return {
      intent: "mot_preparation",
      confidence: 0.9,
      missing,
      rationale: [
        "User explicitly referenced MOT",
        "Risk is primarily driven by age and mileage"
      ],
      route: {
        label: "Open MOT Predictor",
        href: "/mot"
      }
    };
  }

  if (hasEv) {
    return {
      intent: "ev_charging_readiness",
      confidence: 0.85,
      missing: ["location"],
      rationale: [
        "User referenced EV charging",
        "Location is required for charger availability"
      ],
      route: {
        label: "Open EV Finder",
        href: "/ev-finder"
      }
    };
  }

  if (hasUsed) {
    return {
      intent: "used_car_buyer",
      confidence: 0.8,
      missing: ["budget", "vehicle age"],
      rationale: [
        "User is evaluating a used vehicle",
        "MOT history and advisories reduce purchase risk"
      ],
      route: {
        label: "Check MOT History",
        href: "/mot"
      }
    };
  }

  return {
    intent: "unknown",
    confidence: 0.4,
    missing: ["goal clarification"],
    rationale: ["No strong domain signal detected"],
    route: null
  };
}
