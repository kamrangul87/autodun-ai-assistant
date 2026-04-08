// src/pages/ai-assistant.tsx
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";

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
  sections?: {
    understanding?: string;
    analysis?: string[];
    recommended_next_step?: string;
  };
  actions?: AgentAction[];
  meta?: { request_id?: string; tool_calls?: Array<{ name: string; ok: boolean; ms: number }> };
};

const PROMPT_CHIPS = [
  { emoji: "🔍", text: "MOT intelligence for ML58FOU" },
  { emoji: "🚗", text: "My car is 8 years old with 65k miles — what should I check before MOT?" },
  { emoji: "⚡", text: "EV chargers near SW1A 1AA" },
  { emoji: "🛒", text: "Is a 2018 Ford Focus with 3 MOT fails worth buying?" },
];

const GUIDED_CHOICES: Array<{ label: string; prompt: string; hint: string; intent: AgentIntent }> =
  [
    {
      label: "MOT help",
      prompt: "My car is 10 years old with 120k miles — what should I check before MOT?",
      hint: "Adds age + mileage to reduce uncertainty",
      intent: "mot_preparation",
    },
    {
      label: "EV charging near me",
      prompt: "chargers near SW1A 1AA",
      hint: "Add your postcode for nearby chargers",
      intent: "ev_charging_readiness",
    },
    {
      label: "Used car checks",
      prompt: "I'm buying a used car — what should I check before purchase and in MOT history?",
      hint: "Clarifies the buying workflow",
      intent: "used_car_buyer",
    },
  ];

function safeText(x: any): string {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

function safeArray(x: any): string[] {
  return Array.isArray(x) ? x.map((v) => safeText(v)) : [];
}

/* =======================
   Tiny Icons (no deps)
======================= */

function Icon({
  name,
  className = "h-4 w-4",
}: {
  name:
    | "car"
    | "bolt"
    | "search"
    | "info"
    | "check"
    | "warn"
    | "x"
    | "copy"
    | "external"
    | "spark"
    | "id"
    | "lock"
    | "star";
  className?: string;
}) {
  const common = { className, fill: "none", stroke: "currentColor", strokeWidth: 2 };
  switch (name) {
    case "car":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M3 13l2-6a3 3 0 0 1 2.84-2h8.32A3 3 0 0 1 21 7l2 6" />
          <path d="M5 13h14a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-1" />
          <path d="M5 13a2 2 0 0 0-2 2v3a1 1 0 0 0 1 1h1" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
          <path d="M7 11h10" />
        </svg>
      );
    case "bolt":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M13 2L3 14h7l-1 8 12-14h-7l-1-6z" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    case "info":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 10v7" />
          <path d="M12 7h.01" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "warn":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 2l10 18H2L12 2z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      );
    case "copy":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M9 9h10v10H9z" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </svg>
      );
    case "external":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M14 3h7v7" />
          <path d="M10 14L21 3" />
          <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 2l1.5 5L19 9l-5.5 2L12 16l-1.5-5L5 9l5.5-2L12 2z" />
          <path d="M19 14l.8 2.6L22 18l-2.2 1.4L19 22l-.8-2.6L16 18l2.2-1.4L19 14z" />
        </svg>
      );
    case "id":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 15h6" />
          <path d="M7 11h10" />
          <path d="M17 15h0.01" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-7z" />
        </svg>
      );
    default:
      return null;
  }
}

function intentMeta(intent: AgentIntent) {
  if (intent === "mot_preparation")
    return { label: "MOT Intelligence", icon: "car" as const };
  if (intent === "ev_charging_readiness")
    return { label: "EV Charging", icon: "bolt" as const };
  if (intent === "used_car_buyer") return { label: "Used Car", icon: "search" as const };
  return { label: "Unknown", icon: "info" as const };
}

/* =======================
   UI Bits
======================= */

function Badge({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
      {icon ? <span className="text-slate-300">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

function StatusChip({ status }: { status: AgentStatus }) {
  const base =
    "rounded-full px-3 py-1 text-xs font-medium border inline-flex items-center gap-2";
  if (status === "ok")
    return (
      <span className={`${base} border-emerald-900 bg-emerald-950/40 text-emerald-200`}>
        <Icon name="check" className="h-4 w-4" />
        OK
      </span>
    );
  if (status === "needs_clarification")
    return (
      <span className={`${base} border-amber-900 bg-amber-950/40 text-amber-200`}>
        <Icon name="warn" className="h-4 w-4" />
        Needs clarification
      </span>
    );
  if (status === "out_of_scope")
    return (
      <span className={`${base} border-slate-700 bg-slate-950/40 text-slate-200`}>
        <Icon name="info" className="h-4 w-4" />
        Out of scope
      </span>
    );
  return (
    <span className={`${base} border-red-900 bg-red-950/40 text-red-200`}>
      <Icon name="x" className="h-4 w-4" />
      Error
    </span>
  );
}

function IntentChip({ intent }: { intent: AgentIntent }) {
  const meta = intentMeta(intent);
  return (
    <Badge icon={<Icon name={meta.icon} className="h-4 w-4" />}>{meta.label}</Badge>
  );
}

/* =======================
   Monetisation UI — replaced by /pricing page
======================= */

export default function AIAssistantPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  // Latest response (always shown)
  const [latestRes, setLatestRes] = useState<AgentResponse | null>(null);

  // Last successful "ok" response (optional, shown separately)
  const [lastOkRes, setLastOkRes] = useState<AgentResponse | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);

  // Abort + request sequencing to prevent stale overwrites
  const abortRef = useRef<AbortController | null>(null);
  const reqSeqRef = useRef(0);

  // ✅ NEW: Prevent auto-run from firing twice (StrictMode / re-renders)
  const deepLinkRanRef = useRef(false);

  const canRun = useMemo(() => text.trim().length >= 3 && !loading, [text, loading]);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      abortRef.current?.abort();
    };
  }, []);

  // ✅ NEW: Deep-link support for /ai-assistant?intent=mot&vrm=...
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (deepLinkRanRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const intent = (params.get("intent") || "").toLowerCase();
    const vrmRaw = params.get("vrm") || params.get("plate") || "";
    const vrm = vrmRaw.trim().replace(/\s+/g, "").toUpperCase();

    // Only override on explicit MOT intent
    if (intent === "mot") {
      deepLinkRanRef.current = true;

      // Prefer a very clear MOT prompt so the router never "sticks" on EV
      const prompt = vrm ? `MOT intelligence for ${vrm}` : "MOT help";

      // Set UI prompt + run automatically
      setText(prompt);

      // Run after state update is applied
      setTimeout(() => {
        runAgent(prompt);
      }, 50);
    }
  }, []);

  async function runAgent(overrideText?: string) {
    const finalText = (overrideText ?? text).trim();
    if (finalText.length < 3) return;

    // cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // sequence id to ignore late responses
    const seq = ++reqSeqRef.current;

    setErr(null);
    setLoading(true);
    setLastPrompt(finalText);
    setLastAt(new Date().toLocaleString());

    // IMPORTANT: clear latestRes so UI never shows old results while loading
    setLatestRes(null);

    try {
      const r = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text: finalText,
          context: { locale: "en-GB", timezone: "Europe/London" },
        }),
      });

      const data = (await r.json()) as AgentResponse;

      // ignore if a newer request already started
      if (seq !== reqSeqRef.current) return;

      // If API returned non-2xx, still show the payload as "latestRes"
      if (!r.ok) {
        setLatestRes({
          status: "error",
          intent: data?.intent ?? "unknown_out_of_scope",
          sections: {
            understanding: data?.sections?.understanding ?? "Request failed.",
            analysis: safeArray(data?.sections?.analysis).length
              ? safeArray(data?.sections?.analysis)
              : [safeText((data as any)?.error) || "The request failed."],
            recommended_next_step:
              data?.sections?.recommended_next_step ?? "Please try again.",
          },
          actions:
            data?.actions ?? [
              { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
              {
                label: "Open EV Charger Finder",
                href: "https://ev.autodun.com/",
                type: "secondary",
              },
            ],
          meta: data?.meta,
        });
        throw new Error(
          data?.sections?.recommended_next_step ||
            safeText((data as any)?.error) ||
            "Request failed"
        );
      }

      // ✅ Always show the latest response, including needs_clarification
      const normalized: AgentResponse = {
        status: data?.status ?? "ok",
        intent: data?.intent ?? "unknown_out_of_scope",
        sections: {
          understanding: safeText(data?.sections?.understanding),
          analysis: safeArray(data?.sections?.analysis),
          recommended_next_step: safeText(data?.sections?.recommended_next_step),
        },
        actions: Array.isArray(data?.actions) ? data.actions : [],
        meta: data?.meta,
      };

      setLatestRes(normalized);

      // keep last success separately
      if (normalized.status === "ok") {
        setLastOkRes(normalized);
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        // user triggered new request; do not show error
        return;
      }
      setErr(e?.message || "Something went wrong. Please try again.");
    } finally {
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }

  function clearAll() {
    abortRef.current?.abort();
    setText("");
    setLatestRes(null);
    setErr(null);
    setLastPrompt(null);
    setLastAt(null);
  }

  function copyReport() {
    const payload = {
      prompt: lastPrompt,
      analyzed_at: lastAt,
      latest_response: latestRes,
      last_successful_ok_response: lastOkRes,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
  }

  // Tiny extra: copy ONLY the latest rendered content (quick share)
  function copyLatestResultText() {
    if (!latestRes) return;
    const lines: string[] = [];
    lines.push(`Intent: ${intentMeta(latestRes.intent).label}`);
    lines.push(`Status: ${latestRes.status}`);
    const u = safeText(latestRes.sections?.understanding);
    if (u) lines.push(`\nUnderstanding:\n${u}`);
    const a = safeArray(latestRes.sections?.analysis);
    if (a.length) lines.push(`\nAnalysis:\n${a.map((x) => `- ${x}`).join("\n")}`);
    const n = safeText(latestRes.sections?.recommended_next_step);
    if (n) lines.push(`\nNext step:\n${n}`);
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
  }

  const showGuided =
    !!latestRes &&
    (latestRes.status === "out_of_scope" ||
      latestRes.intent === "unknown_out_of_scope" ||
      latestRes.status === "needs_clarification");

  const traceText =
    latestRes?.meta?.tool_calls?.length
      ? `Trace: ${latestRes.meta.tool_calls
          .map((t) => `${t.name}${t.ok ? "" : "(!)"}`)
          .slice(0, 3)
          .join(", ")}`
      : null;

  // Tiny MOT-specific helper hint (only when we need clarification)
  const needsVrmHint =
    latestRes?.status === "needs_clarification" && latestRes.intent === "mot_preparation";

  return (
    <>
      <Head>
        <title>Autodun AI Assistant | Free Automotive AI for UK Drivers — MOT, EV & Car Advice</title>
        <meta
          name="description"
          content="Get instant AI-powered vehicle guidance. Ask about MOT risk, EV charging near you, or used car buying. Free automotive intelligence powered by real UK data."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://ai.autodun.com/ai-assistant" />
      </Head>

      <main style={{ backgroundColor: "#070f1a", color: "#f0f6ff", minHeight: "100vh" }}>

        {/* Hero Section */}
        <section style={{ textAlign: "center", padding: "64px 24px 48px", maxWidth: "800px", margin: "0 auto" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "rgba(0,212,138,0.12)",
            border: "1px solid rgba(0,212,138,0.3)",
            borderRadius: "100px",
            padding: "6px 16px",
            fontSize: "12px",
            fontWeight: 700,
            color: "#00d48a",
            letterSpacing: "0.08em",
            marginBottom: "24px",
          }}>
            ⚡ AI AUTOMOTIVE INTELLIGENCE
          </div>

          <h1 style={{ fontSize: "clamp(26px, 5vw, 46px)", fontWeight: 800, color: "#f0f6ff", lineHeight: 1.2, margin: "0 0 16px" }}>
            Your AI Co-Pilot for UK Car Decisions
          </h1>

          <p style={{ fontSize: "16px", color: "#8899aa", lineHeight: 1.7, maxWidth: "560px", margin: "0 auto" }}>
            Ask about MOT risk, EV charging near you, or buying a used car — get structured, explainable answers powered by real UK data
          </p>

          {latestRes ? (
            <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <IntentChip intent={latestRes.intent} />
              <StatusChip status={latestRes.status} />
              {latestRes.meta?.request_id ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#8899aa" }}>
                  <Icon name="id" className="h-3.5 w-3.5" />
                  {latestRes.meta.request_id}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Main content */}
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 24px 80px" }}>

          {/* Input Card */}
          <div style={{
            backgroundColor: "#111f33",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            padding: "24px",
          }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#f0f6ff", marginBottom: "12px" }}>
              Tell me what you&apos;re trying to do…
            </label>

            <textarea
              style={{
                width: "100%",
                backgroundColor: "#0d1b2a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                padding: "14px 16px",
                fontSize: "15px",
                color: "#f0f6ff",
                lineHeight: 1.6,
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                transition: "border-color 0.15s",
              }}
              rows={4}
              placeholder="Example: MOT intelligence for ML58FOU OR chargers near SW1A 1AA"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#00d48a"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
            />

            {/* Prompt Chips */}
            <div style={{ marginTop: "12px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip.text}
                  type="button"
                  onClick={() => setText(chip.text)}
                  style={{
                    backgroundColor: "#111f33",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "20px",
                    padding: "8px 14px",
                    fontSize: "13px",
                    color: "#c8d8e8",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#00d48a"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                >
                  {chip.emoji} {chip.text}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => runAgent()}
                disabled={!canRun}
                style={{
                  backgroundColor: canRun ? "#00d48a" : "rgba(0,212,138,0.35)",
                  color: "#070f1a",
                  fontWeight: 800,
                  borderRadius: "10px",
                  padding: "10px 22px",
                  fontSize: "14px",
                  border: "none",
                  cursor: canRun ? "pointer" : "not-allowed",
                  transition: "background 0.15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (canRun) e.currentTarget.style.backgroundColor = "#00e5a0"; }}
                onMouseLeave={(e) => { if (canRun) e.currentTarget.style.backgroundColor = "#00d48a"; }}
              >
                {loading ? "Running analysis…" : "Analyse"}
              </button>

              <button
                type="button"
                onClick={clearAll}
                style={{
                  backgroundColor: "transparent",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px",
                  padding: "10px 18px",
                  fontSize: "14px",
                  color: "#c8d8e8",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
              >
                Clear
              </button>

              <button
                type="button"
                onClick={copyReport}
                disabled={!latestRes && !lastOkRes}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "transparent",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px",
                  padding: "10px 18px",
                  fontSize: "14px",
                  color: "#c8d8e8",
                  cursor: !latestRes && !lastOkRes ? "not-allowed" : "pointer",
                  opacity: !latestRes && !lastOkRes ? 0.4 : 1,
                  transition: "border-color 0.15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (latestRes || lastOkRes) e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
              >
                <Icon name="copy" className="h-4 w-4" />
                Copy report
              </button>

              {err ? <p style={{ marginLeft: "auto", fontSize: "14px", color: "#ff6b6b" }}>{err}</p> : null}
            </div>
          </div>

          {/* Trust Signals */}
          <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "20px" }}>
            <span style={{ fontSize: "12px", color: "#8899aa" }}>🔒 Your queries are not stored</span>
            <span style={{ fontSize: "12px", color: "#8899aa" }}>🇬🇧 UK vehicle data only</span>
            <span style={{ fontSize: "12px", color: "#8899aa" }}>⚡ Powered by real DVSA + OCM data</span>
          </div>

          {lastPrompt ? (
            <p style={{ marginTop: "10px", textAlign: "center", fontSize: "12px", color: "#556677" }}>
              Last query: <span style={{ color: "#8899aa" }}>{lastPrompt}</span>
              {lastAt ? <span> · {lastAt}</span> : null}
            </p>
          ) : null}

          {/* Result Display Card */}
          {latestRes ? (
            <section style={{
              marginTop: "28px",
              backgroundColor: "#111f33",
              border: "1px solid rgba(0,212,138,0.2)",
              borderRadius: "14px",
              padding: "24px",
            }}>
              <div style={{ marginBottom: "20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#00d48a", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    AI Analysis
                  </span>
                  <StatusChip status={latestRes.status} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {traceText ? <span style={{ fontSize: "11px", color: "#8899aa" }}>{traceText}</span> : null}
                  <button
                    type="button"
                    onClick={copyLatestResultText}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      backgroundColor: "transparent",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      padding: "6px 12px",
                      fontSize: "12px",
                      color: "#c8d8e8",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    title="Copy the latest result text"
                  >
                    <Icon name="copy" className="h-4 w-4" />
                    Copy result
                  </button>
                </div>
              </div>

              {needsVrmHint ? (
                <div style={{
                  marginBottom: "16px",
                  backgroundColor: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.25)",
                  borderRadius: "10px",
                  padding: "14px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                }}>
                  <span style={{ color: "#fbbf24", marginTop: "2px", flexShrink: 0 }}>
                    <Icon name="warn" className="h-5 w-5" />
                  </span>
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 600, color: "#fbbf24", margin: "0 0 4px" }}>
                      Quick tip: paste your VRM to run MOT Intelligence
                    </p>
                    <p style={{ fontSize: "12px", color: "rgba(251,191,36,0.8)", margin: 0 }}>
                      Example: <strong>ML58FOU</strong> or <strong>MOT intelligence for ML58FOU</strong>.
                    </p>
                  </div>
                </div>
              ) : null}

              <Section
                title="Understanding your situation"
                body={safeText(latestRes.sections?.understanding)}
              />
              <SectionList title="Analysis" items={safeArray(latestRes.sections?.analysis)} />
              <Section
                title="Recommended next step"
                body={safeText(latestRes.sections?.recommended_next_step)}
              />

              {showGuided ? (
                <div style={{
                  marginTop: "20px",
                  backgroundColor: "#0d1b2a",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "10px",
                  padding: "16px",
                }}>
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f6ff", margin: "0 0 4px" }}>Choose a goal:</h3>
                  <p style={{ fontSize: "12px", color: "#8899aa", margin: "0 0 12px" }}>
                    These options add the minimum details needed for a confident route.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
                    {GUIDED_CHOICES.map((c) => {
                      const meta = intentMeta(c.intent);
                      return (
                        <button
                          key={c.label}
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            setText(c.prompt);
                            runAgent(c.prompt);
                          }}
                          style={{
                            backgroundColor: "#111f33",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "10px",
                            padding: "12px",
                            textAlign: "left",
                            cursor: loading ? "not-allowed" : "pointer",
                            opacity: loading ? 0.4 : 1,
                            fontFamily: "inherit",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <span style={{
                              display: "inline-flex",
                              width: "30px",
                              height: "30px",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "#0d1b2a",
                              borderRadius: "8px",
                              color: "#00d48a",
                              flexShrink: 0,
                            }}>
                              <Icon name={meta.icon} className="h-4 w-4" />
                            </span>
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "#f0f6ff" }}>{c.label}</span>
                          </div>
                          <div style={{ fontSize: "11px", color: "#8899aa" }}>{c.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {Array.isArray(latestRes.actions) && latestRes.actions.length ? (
                <div style={{ marginTop: "20px" }}>
                  <h3 style={{ fontSize: "12px", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
                    Open in Tool
                  </h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {latestRes.actions.map((a) => (
                      <a
                        key={a.label}
                        href={a.href}
                        target="_blank"
                        rel="noreferrer"
                        style={a.type === "primary" ? {
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          backgroundColor: "#00d48a",
                          color: "#070f1a",
                          fontWeight: 700,
                          borderRadius: "8px",
                          padding: "9px 18px",
                          fontSize: "14px",
                          textDecoration: "none",
                        } : {
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          backgroundColor: "transparent",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "8px",
                          padding: "9px 18px",
                          fontSize: "14px",
                          color: "#c8d8e8",
                          textDecoration: "none",
                        }}
                      >
                        {a.label}
                        <Icon name="external" className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: "11px", color: "#556677" }}>
                Informational guidance only. Final MOT decisions are made by authorised MOT testing centres.
              </div>
            </section>
          ) : null}

          {/* Last OK result fallback */}
          {lastOkRes && (!latestRes || latestRes.status !== "ok") ? (
            <section style={{ marginTop: "24px", backgroundColor: "#0d1b2a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px" }}>
              <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f6ff", margin: 0 }}>Last successful result</h2>
                <span style={{ fontSize: "12px", color: "#556677" }}>Shown for reference only (latest result is above).</span>
              </div>
              <Section title="Understanding" body={safeText(lastOkRes.sections?.understanding)} />
              <SectionList title="Analysis" items={safeArray(lastOkRes.sections?.analysis).slice(0, 8)} />
            </section>
          ) : null}

        </div>
      </main>
    </>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div style={{ marginTop: "16px" }}>
      <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#f0f6ff", margin: "0 0 8px" }}>{title}</h3>
      <p style={{ fontSize: "14px", lineHeight: 1.7, color: "#c8d8e8", margin: 0, whiteSpace: "pre-wrap" }}>{body}</p>
    </div>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  const clean = (items || []).filter(Boolean);
  if (!clean.length) return null;

  return (
    <div style={{ marginTop: "16px" }}>
      <h3 style={{ fontSize: "13px", fontWeight: 600, color: "#f0f6ff", margin: "0 0 8px" }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: "20px", listStyle: "disc", fontSize: "14px", color: "#c8d8e8", lineHeight: 1.7 }}>
        {clean.map((x, i) => (
          <li key={i} style={{ marginBottom: "4px" }}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
