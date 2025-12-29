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

const GUIDED_CHOICES: Array<{ label: string; prompt: string; hint: string }> = [
  {
    label: "MOT help",
    prompt: "My car is 10 years old with 120k miles — what should I check before MOT?",
    hint: "Adds age + mileage to reduce uncertainty",
  },
  {
    label: "EV charging near me",
    prompt: "chargers near SW1A 1AA",
    hint: "Add your postcode for nearby chargers",
  },
  {
    label: "Used car checks",
    prompt: "I’m buying a used car — what should I check before purchase and in MOT history?",
    hint: "Clarifies the buying workflow",
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
      {children}
    </span>
  );
}

function StatusChip({ status }: { status: AgentStatus }) {
  const base =
    "rounded-full px-3 py-1 text-xs font-medium border inline-flex items-center gap-2";
  if (status === "ok")
    return <span className={`${base} border-emerald-900 bg-emerald-950/40 text-emerald-200`}>OK</span>;
  if (status === "needs_clarification")
    return <span className={`${base} border-amber-900 bg-amber-950/40 text-amber-200`}>Needs clarification</span>;
  if (status === "out_of_scope")
    return <span className={`${base} border-slate-700 bg-slate-950/40 text-slate-200`}>Out of scope</span>;
  return <span className={`${base} border-red-900 bg-red-950/40 text-red-200`}>Error</span>;
}

function IntentChip({ intent }: { intent: AgentIntent }) {
  const map: Record<AgentIntent, string> = {
    mot_preparation: "MOT Intelligence",
    ev_charging_readiness: "EV Charging",
    used_car_buyer: "Used Car",
    unknown_out_of_scope: "Unknown",
  };
  return <Badge>{map[intent] ?? "Unknown"}</Badge>;
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
          actions: data?.actions ?? [
            { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
            { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" },
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
    navigator.clipboard
      .writeText(JSON.stringify(payload, null, 2))
      .catch(() => {});
  }

  const showGuided =
    !!latestRes &&
    (latestRes.status === "out_of_scope" || latestRes.intent === "unknown_out_of_scope" || latestRes.status === "needs_clarification");

  const traceText =
    latestRes?.meta?.tool_calls?.length
      ? `Trace: ${latestRes.meta.tool_calls
          .map((t) => `${t.name}${t.ok ? "" : "(!)"}`)
          .slice(0, 3)
          .join(", ")}`
      : null;

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
              <h1 className="text-2xl font-semibold tracking-tight">Autodun AI Assistant</h1>
              <Badge>Beta</Badge>
              {latestRes ? <IntentChip intent={latestRes.intent} /> : null}
              {latestRes ? <StatusChip status={latestRes.status} /> : null}
              {latestRes?.meta?.request_id ? (
                <span className="text-xs text-slate-400">Request: {latestRes.meta.request_id}</span>
              ) : null}
            </div>

            <p className="mt-2 text-slate-300">
              Tell your goal — the assistant routes you to the right Autodun tool and explains the decision.
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
                className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Copy report
              </button>

              {err ? <p className="ml-auto text-sm text-red-300">{err}</p> : null}
            </div>
          </section>

          {/* ✅ Latest response always shown (no stale “old result”) */}
          {latestRes ? (
            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Latest result</h2>
                {traceText ? <span className="text-xs text-slate-400">{traceText}</span> : null}
              </div>

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
                    {GUIDED_CHOICES.map((c) => (
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
                        <div className="text-sm font-semibold text-slate-100">{c.label}</div>
                        <div className="mt-1 text-xs text-slate-400">{c.hint}</div>
                      </button>
                    ))}
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
                            ? "rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950"
                            : "rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                        }
                      >
                        {a.label}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-400">
                Informational guidance only. Final MOT decisions are made by authorised MOT testing centres.
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
              <Section
                title="Understanding"
                body={safeText(lastOkRes.sections?.understanding)}
              />
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
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-200 whitespace-pre-wrap">{body}</p>
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
