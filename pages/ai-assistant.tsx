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

const EXAMPLES = [
  "MOT intelligence for ML58FOU",
  "My car is 8 years old with 65000 miles — what should I check before MOT?",
  "chargers near SW1A 1AA",
] as const;

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
      prompt: "I’m buying a used car — what should I check before purchase and in MOT history?",
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
   Monetisation UI (minimal)
======================= */

function MonetisationCard() {
  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40 text-slate-200">
            <Icon name="lock" className="h-5 w-5" />
          </span>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-100">
                Unlock Pro Insights (coming soon)
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/40 px-2 py-0.5 text-[11px] text-slate-300">
                <Icon name="star" className="h-3.5 w-3.5" />
                Pro
              </span>
            </div>

            <p className="mt-1 text-xs text-slate-400">
              Commercial roadmap (no payments enabled in v1). This helps demonstrate product
              strategy and future scalability.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="text-xs font-semibold text-slate-200">Free (today)</div>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">
                  <li>• One-time structured guidance</li>
                  <li>• Routing to MOT / EV / Used workflows</li>
                  <li>• Copyable report output</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                <div className="text-xs font-semibold text-slate-200">Pro (planned)</div>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">
                  <li>• Full MOT trend analysis</li>
                  <li>• Cost forecasting bands</li>
                  <li>• Saved vehicles + reminders</li>
                </ul>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              B2B: Bulk access & analytics planned for councils and dealerships.
            </p>
          </div>
        </div>

        <div className="sm:pt-1">
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950"
          >
            View Pro features
            <Icon name="external" className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

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

  const canRun = useMemo(() => text.trim().length >= 3 && !loading, [text, loading]);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      abortRef.current?.abort();
    };
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
        <title>Autodun AI Assistant</title>
        <meta
          name="description"
          content="Autodun Decision Agent — routes users to MOT Predictor and EV Finder with structured guidance."
        />
      </Head>

      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <header className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/40">
                  <Icon name="spark" className="h-5 w-5 text-slate-200" />
                </span>
                Autodun AI Assistant
              </h1>

              <Badge>Beta</Badge>
              {latestRes ? <IntentChip intent={latestRes.intent} /> : null}
              {latestRes ? <StatusChip status={latestRes.status} /> : null}

              {latestRes?.meta?.request_id ? (
                <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                  <Icon name="id" className="h-4 w-4" />
                  Request: {latestRes.meta.request_id}
                </span>
              ) : null}

              <a
                href="/pricing"
                className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                title="View pricing (coming soon)"
              >
                <Icon name="lock" className="h-4 w-4" />
                Pro (coming soon)
              </a>
            </div>

            <p className="mt-2 text-slate-300">
              Tell your goal — the assistant routes you to the right Autodun tool and explains the
              decision.
            </p>

            {lastPrompt ? (
              <p className="mt-2 text-xs text-slate-400">
                Last analyzed prompt: <span className="text-slate-200">{lastPrompt}</span>
                {lastAt ? <span className="text-slate-500"> · {lastAt}</span> : null}
              </p>
            ) : null}
          </header>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-sm">
            <label className="block text-sm font-medium text-slate-200">
              Tell me what you’re trying to do…
            </label>

            <textarea
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600"
              rows={4}
              placeholder="Example: MOT intelligence for ML58FOU OR chargers near SW1A 1AA"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setText(ex)}
                  className="rounded-full border border-slate-800 bg-slate-950/30 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
                >
                  {ex}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => runAgent()}
                disabled={!canRun}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                {loading ? "Running analysis…" : "Analyze"}
              </button>

              <button
                type="button"
                onClick={clearAll}
                className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={copyReport}
                disabled={!latestRes && !lastOkRes}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                <Icon name="copy" className="h-4 w-4" />
                Copy report
              </button>

              {err ? <p className="ml-auto text-sm text-red-300">{err}</p> : null}
            </div>
          </section>

          {/* ✅ Latest response always shown (no stale “old result”) */}
          {latestRes ? (
            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Latest result</h2>

                <div className="flex items-center gap-2">
                  {traceText ? <span className="text-xs text-slate-400">{traceText}</span> : null}

                  <button
                    type="button"
                    onClick={copyLatestResultText}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                    title="Copy the latest result text"
                  >
                    <Icon name="copy" className="h-4 w-4" />
                    Copy result
                  </button>
                </div>
              </div>

              {needsVrmHint ? (
                <div className="mb-4 rounded-2xl border border-amber-900/40 bg-amber-950/30 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-amber-200">
                      <Icon name="warn" className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-amber-200">
                        Quick tip: paste your VRM to run MOT Intelligence
                      </p>
                      <p className="mt-1 text-xs text-amber-200/80">
                        Example: <span className="font-semibold">ML58FOU</span> or{" "}
                        <span className="font-semibold">MOT intelligence for ML58FOU</span>.
                      </p>
                    </div>
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
                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-slate-200">Choose a goal:</h3>
                    <p className="text-xs text-slate-400">
                      These options add the minimum details needed for a confident route.
                    </p>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
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
                          className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left hover:bg-slate-800 disabled:opacity-40"
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/30 text-slate-200">
                              <Icon name={meta.icon} className="h-4 w-4" />
                            </span>
                            <div className="text-sm font-semibold text-slate-100">{c.label}</div>
                          </div>
                          <div className="mt-2 text-xs text-slate-400">{c.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {Array.isArray(latestRes.actions) && latestRes.actions.length ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-slate-200">Actions</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {latestRes.actions.map((a) => (
                      <a
                        key={a.label}
                        href={a.href}
                        target="_blank"
                        rel="noreferrer"
                        className={
                          a.type === "primary"
                            ? "inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950"
                            : "inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                        }
                      >
                        {a.label}
                        <Icon name="external" className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* ✅ Monetisation Layer (UI-only, non-blocking) */}
              <MonetisationCard />

              <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-400">
                Informational guidance only. Final MOT decisions are made by authorised MOT testing
                centres.
              </div>
            </section>
          ) : null}

          {/* Optional: show last OK separately, but never as the “current” result */}
          {lastOkRes && (!latestRes || latestRes.status !== "ok") ? (
            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/20 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-200">Last successful result</h2>
                <span className="text-xs text-slate-500">
                  Shown for reference only (latest result is above).
                </span>
              </div>
              <Section title="Understanding" body={safeText(lastOkRes.sections?.understanding)} />
              <SectionList
                title="Analysis"
                items={safeArray(lastOkRes.sections?.analysis).slice(0, 8)}
              />
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
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{body}</p>
    </div>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  const clean = (items || []).filter(Boolean);
  if (!clean.length) return null;

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
        {clean.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
