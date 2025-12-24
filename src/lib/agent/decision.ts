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

/**
 * Helper: try to extract a UK-style postcode from free text.
 * This reduces "missing postcode" false-positives when users type:
 *  - "SW1A 1AA"
 *  - "sw1a1aa"
 *  - "My postcode is SW1A 1AA"
 */
function extractUkPostcode(input: string): string | null {
  const text = (input || "").toUpperCase();

  // Loose UK postcode matcher; keeps it practical (not perfect validation)
  // Supports spaced or unspaced forms (e.g., SW1A1AA, SW1A 1AA).
  const m = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  if (!m) return null;

  // Normalize to standard spacing: outward + space + inward
  const raw = m[1].replace(/\s+/g, "");
  if (raw.length < 5) return null;

  const outward = raw.slice(0, raw.length - 3);
  const inward = raw.slice(-3);
  return `${outward} ${inward}`;
}

/**
 * Helper: detect if the user specified a connector type (optional).
 */
function hasConnectorType(text: string): boolean {
  const t = (text || "").toLowerCase();
  const connectorSignals = [
    "type 2",
    "type2",
    "ccs",
    "ccs2",
    "chademo",
    "tesla",
    "supercharger",
    "rapid",
    "fast charger",
    "7kw",
    "11kw",
    "22kw",
    "50kw",
    "150kw",
    "350kw",
  ];
  return connectorSignals.some((s) => t.includes(s));
}

export function decideIntent(input: string): AgentDecision {
  const text = (input || "").toLowerCase().trim();

  // Signals
  const motSignals = ["mot", "fail", "advisory", "pass", "mileage", "odometer", "vrm", "registration"];
  const evSignals = ["ev", "charge", "charging", "charger", "station", "plug", "connector", "nearest", "nearby", "postcode"];
  const usedSignals = ["used car", "buying", "second hand", "secondhand", "purchase", "seller"];

  const hasMot = motSignals.some((s) => text.includes(s));
  const hasEv = evSignals.some((s) => text.includes(s));
  const hasUsed = usedSignals.some((s) => text.includes(s));

  // Helpers: detect age + mileage
  const hasAge = /\b\d+\s*(year|years|yr|yrs)\b/.test(text);
  const hasMileage =
    /\b\d{1,3}(?:,\d{3})?\s*(mile|miles|mi)\b/.test(text) || /\b\d{4,6}\b/.test(text);

  // EV helper: detect postcode already present in message
  const postcode = extractUkPostcode(input);
  const alreadyHasPostcode = !!postcode;

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
      route: { label: "Open MOT Predictor", href: "https://mot.autodun.com" },
    };
  }

  if (hasEv) {
    const missing: string[] = [];

    // Only ask for postcode if the user didn't already include one
    if (!alreadyHasPostcode) missing.push("your location / postcode");

    // Connector type is optional; only mark missing if not provided
    if (!hasConnectorType(input)) missing.push("connector type (optional)");

    return {
      intent: "ev_charging_readiness",
      confidence: 0.85,
      missing,
      rationale: [
        "You referenced EV charging",
        "Location determines nearby availability and practical charging options",
      ],
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
