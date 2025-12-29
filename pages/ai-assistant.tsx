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
  sections: {
    understanding: string;
    analysis: string[];
    recommended_next_step: string;
  };
  actions: AgentAction[];
  meta?: { request_id?: string; tool_calls?: Array<{ name: string; ok: boolean; ms: number }> };
};

const EXAMPLES = [
  "MOT intelligence for ML58FOU",
  "My car is 8 years old with 65000 miles — what should I check before MOT?",
  "chargers near SW1A 1AA",
] as const;

function safeResponse(x: any): AgentResponse {
  const fallback: AgentResponse = {
    status: "error",
    intent: "unknown_out_of_scope",
    sections: {
      understanding: "We could not read the server response.",
      analysis: ["The API returned an unexpected shape."],
      recommended_next_step: "Try again. If it persists, redeploy and re-test /api/agent/run.",
    },
    actions: [
      { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
      { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" },
    ],
    meta: { request_id: "unknown", tool_calls: [] },
  };

  if (!x || typeof x !== "object") return fallback;

  const status: AgentStatus =
    x.status === "ok" || x.status === "needs_clarification" || x.status === "out_of_scope" || x.status === "error"
      ? x.status
      : "error";

  const intent: AgentIntent =
    x.intent === "mot_preparation" ||
    x.intent === "ev_charging_readiness" ||
    x.intent === "used_car_buyer" ||
    x.intent === "unknown_out_of_scope"
      ? x.intent
      : "unknown_out_of_scope";

  const sectionsObj = x.sections && typeof x.sections === "object" ? x.sections : {};
  const understanding = typeof sectionsObj.understanding === "string" ? sectionsObj.understanding : "—";
  const analysis = Array.isArray(sectionsObj.analysis) ? sectionsObj.analysis.filter((s: any) => typeof s === "string") : [];
  const recommended_next_step =
    typeof sectionsObj.recommended_next_step === "string" ? sectionsObj.recommended_next_step : "—";

  const actions: AgentAction[] = Array.isArray(x.actions)
    ? x.actions
        .filter((a: any) => a && typeof a === "object")
        .map((a: any) => ({
          label: typeof a.label === "string" ? a.label : "Open",
          href: typeof a.href === "string" ? a.href : "/",
          type: a.type === "primary" || a.type === "secondary" ? a.type : "secondary",
        }))
    : fallback.actions;

  return {
    status,
    intent,
    sections: { understanding, analysis, recommended_next_step },
    actions,
    meta: x.meta,
  };
}

export default function AIAssistantPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AgentResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ✅ Track what was actually analyzed (prevents “old result” confusion)
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [lastAt, setLastAt] = useState<number | null>(null);

  // Used to avoid “double-run” from fast clicks
  const inFlight = useRef(false);

  const canRun = useMemo(() => text.trim().length >= 3 && !loading, [text, loading]);
  const hasTextChangedSinceLastRun = useMemo(() => {
    const t = text.trim();
    const lp = lastPrompt.trim();
    if (!lp) return false;
    return t !== lp;
  }, [text, lastPrompt]);

  async function runAgent(overrideText?: string) {
    const finalText = (overrideText ?? text).trim();
    if (finalText.length < 3) return;

    if (inFlight.current) return;
    inFlight.current = true;

    setErr(null);
    setLoading(true);

    try {
      const r = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: finalText, context: { locale: "en-GB", timezone: "Europe/London" } }),
      });

      const json = await r.json().catch(() => ({}));
      const data = safeResponse(json);

      setRes(data);
      setLastPrompt(finalText);
      setLastAt(Date.now());

      // If API gives "error" we still show it (no crash)
      if (!r.ok) {
        setErr(data.sections.recommended_next_step || "Request failed");
      }
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
      setRes(
        safeResponse({
          status: "error",
          intent: "unknown_out_of_scope",
          sections: {
            understanding: "We could not complete the analysis.",
            analysis: ["A temporary error occurred while running the agent."],
            recommended_next_step: "Please try again in a moment.",
          },
          actions: [
            { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
            { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" },
          ],
          meta: { request_id: "client_error", tool_calls: [] },
        })
      );
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }

  function clearAll() {
    setText("");
    setRes(null);
    setErr(null);
    setLastPrompt("");
    setLastAt(null);
  }

  async function copyReport() {
    if (!res) return;

    const payload = {
      analyzed_prompt: lastPrompt || text.trim(),
      analyzed_at: lastAt ? new Date(lastAt).toISOString() : null,
      response: res,
    };

    const readable = [
      `Autodun AI Assistant Report`,
      `Analyzed prompt: ${payload.analyzed_prompt}`,
      `Analyzed at: ${payload.analyzed_at ?? "n/a"}`,
      ``,
      `Understanding: ${res.sections.understanding}`,
      ``,
      `Analysis:`,
      ...res.sections.analysis.map((x) => `- ${x}`),
      ``,
      `Next step: ${res.sections.recommended_next_step}`,
      ``,
      `Actions:`,
      ...res.actions.map((a) => `- ${a.label}: ${a.href}`),
      ``,
      `--- JSON ---`,
      JSON.stringify(payload, null, 2),
    ].join("\n");

    await navigator.clipboard.writeText(readable);
  }

  const showGuided = !!res && (res.status === "out_of_scope" || res.intent === "unknown_out_of_scope");

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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Autodun AI Assistant</h1>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">Beta</span>

              {res?.status ? (
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs text-slate-200 border border-slate-800">
                  {res.status === "ok"
                    ? "OK"
                    : res.status === "needs_clarification"
                    ? "Needs clarification"
                    : res.status === "out_of_scope"
                    ? "Out of scope"
                    : "Error"}
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-slate-300">
              Tell your goal — the assistant routes you to the right Autodun tool and explains the decision.
            </p>

            {lastPrompt ? (
              <p className="mt-2 text-xs text-slate-400">
                Last analyzed prompt: <span className="text-slate-200">{lastPrompt}</span>
                {lastAt ? <span> • {new Date(lastAt).toLocaleString()}</span> : null}
              </p>
            ) : null}
          </header>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-sm">
            <label className="block text-sm font-medium text-slate-200">Tell me what you’re trying to do…</label>

            <textarea
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600"
              rows={4}
              placeholder="Example: chargers near SW1A 1AA"
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

            {hasTextChangedSinceLastRun ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                Text changed since last analysis. Click <b>Analyze</b> to refresh the result.
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-3">
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
                disabled={!res}
                className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Copy report
              </button>

              {err ? <p className="ml-auto text-sm text-red-300">{err}</p> : null}
            </div>
          </section>

          {res ? (
            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Result</h2>

                {res?.meta?.tool_calls?.length ? (
                  <span className="text-xs text-slate-400">
                    Trace:{" "}
                    {res.meta.tool_calls
                      .map((t) => `${t.name}${t.ok ? "" : "(!)"} (${t.ms}ms)`)
                      .slice(0, 3)
                      .join(", ")}
                  </span>
                ) : null}
              </div>

              <Section title="Understanding your situation" body={res.sections.understanding} />
              <SectionList title="Analysis" items={res.sections.analysis} />
              <Section title="Recommended next step" body={res.sections.recommended_next_step} />

              {showGuided ? (
                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                  <h3 className="text-sm font-semibold text-slate-200">Try one of these:</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        const p = "MOT intelligence for ML58FOU";
                        setText(p);
                        runAgent(p);
                      }}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
                    >
                      MOT intelligence for ML58FOU
                    </button>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        const p = "chargers near SW1A 1AA";
                        setText(p);
                        runAgent(p);
                      }}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
                    >
                      chargers near SW1A 1AA
                    </button>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        const p = "I’m buying a used car — what should I check before purchase?";
                        setText(p);
                        runAgent(p);
                      }}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
                    >
                      Used car checks
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-200">Actions</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {res.actions.map((a) => (
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

              <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-400">
                Informational guidance only. Final MOT decisions are made by authorised MOT testing centres.
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-200">{body}</p>
    </div>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
