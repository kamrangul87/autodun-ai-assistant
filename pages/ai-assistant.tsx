// src/pages/ai-assistant.tsx
import Head from "next/head";
import { useMemo, useState } from "react";

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

const GUIDED_CHOICES: Array<{
  label: string;
  prompt: string;
  hint: string;
}> = [
  {
    label: "MOT help",
    prompt: "My car is 10 years old with 120k miles — what should I check before MOT?",
    hint: "Adds age + mileage to reduce uncertainty",
  },
  {
    label: "EV charging near me",
    prompt: "chargers near SW1A 1AA",
    hint: "Adds postcode for charger lookup",
  },
  {
    label: "Used car checks",
    prompt: "I’m buying a used car — what should I check before purchase and in MOT history?",
    hint: "Clarifies the buying workflow",
  },
];

function statusLabel(s: AgentStatus) {
  if (s === "ok") return "OK";
  if (s === "needs_clarification") return "Needs clarification";
  if (s === "out_of_scope") return "Out of scope";
  return "Error";
}

function chipClass(s: AgentStatus) {
  if (s === "ok") return "bg-emerald-900/40 text-emerald-200 border-emerald-800";
  if (s === "needs_clarification") return "bg-amber-900/40 text-amber-200 border-amber-800";
  if (s === "out_of_scope") return "bg-slate-800 text-slate-200 border-slate-700";
  return "bg-red-900/40 text-red-200 border-red-800";
}

export default function AIAssistantPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ New: keep latest response (always update)
  const [latestRes, setLatestRes] = useState<AgentResponse | null>(null);

  // ✅ New: keep last successful response separately
  const [lastOkRes, setLastOkRes] = useState<AgentResponse | null>(null);

  const [err, setErr] = useState<string | null>(null);

  const canRun = useMemo(() => text.trim().length >= 8 && !loading, [text, loading]);

  async function runAgent(overrideText?: string) {
    const finalText = (overrideText ?? text).trim();
    setErr(null);
    setLoading(true);

    // ✅ Important: clear only the latest response so the UI never looks “stuck”
    setLatestRes(null);

    try {
      const r = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: finalText,
          context: { locale: "en-GB", timezone: "Europe/London" },
        }),
      });

      const data = (await r.json()) as AgentResponse;

      // ✅ Always set latest response (even if not OK)
      setLatestRes(data);

      // ✅ Only update lastOkRes when status is ok
      if (r.ok && data?.status === "ok") {
        setLastOkRes(data);
      }

      if (!r.ok) {
        throw new Error(data?.sections?.recommended_next_step || "Request failed");
      }
    } catch (e: any) {
      const msg = e?.message || "Something went wrong. Please try again.";
      setErr(msg);

      // ✅ Ensure latestRes shows an error object (so user sees this request happened)
      setLatestRes({
        status: "error",
        intent: "unknown_out_of_scope",
        sections: {
          understanding: "We could not complete the analysis.",
          analysis: ["A temporary error occurred while running the agent.", `Error: ${msg}`],
          recommended_next_step: "Please try again in a moment.",
        },
        actions: [
          { label: "Open MOT Predictor", href: "https://mot.autodun.com/", type: "secondary" },
          { label: "Open EV Charger Finder", href: "https://ev.autodun.com/", type: "secondary" },
        ],
      });
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setText("");
    setLatestRes(null);
    setLastOkRes(null);
    setErr(null);
  }

  async function copyLatestReport() {
    try {
      if (!latestRes) return;
      await navigator.clipboard.writeText(JSON.stringify(latestRes, null, 2));
      // optional: you can set a toast state if you want
    } catch {
      // ignore
    }
  }

  const showGuided =
    !!latestRes && (latestRes.status === "out_of_scope" || latestRes.status === "needs_clarification");

  const showLastOkPanel =
    !!lastOkRes && (!!latestRes ? latestRes.status !== "ok" : true);

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

              <span className="rounded-full border border-slate-700 bg-slate-900/40 px-3 py-1 text-xs text-slate-200">
                Beta
              </span>

              {latestRes ? (
                <>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs ${chipClass(latestRes.status)}`}
                  >
                    {statusLabel(latestRes.status)}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-900/40 px-3 py-1 text-xs text-slate-200">
                    {latestRes.intent}
                  </span>
                  {latestRes?.meta?.request_id ? (
                    <span className="text-xs text-slate-400">
                      Request: {latestRes.meta.request_id}
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>

            <p className="mt-2 text-slate-300">
              Tell your goal — the assistant routes you to the right Autodun tool and explains the
              decision.
            </p>
          </header>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-sm">
            <label className="block text-sm font-medium text-slate-200">
              Tell me what you’re trying to do…
            </label>

            <textarea
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600"
              rows={4}
              placeholder="Example: MOT intelligence for ML58FOU"
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
                onClick={copyLatestReport}
                disabled={!latestRes}
                className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Copy report
              </button>

              {err ? <p className="ml-auto text-sm text-red-300">{err}</p> : null}
            </div>
          </section>

          {/* ✅ Latest response ALWAYS shown */}
          {latestRes ? (
            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Latest result</h2>
                {latestRes?.meta?.tool_calls?.length ? (
                  <span className="text-xs text-slate-400">
                    Trace:{" "}
                    {latestRes.meta.tool_calls
                      .map((t) => `${t.name}${t.ok ? "" : "(!)"} (${t.ms}ms)`)
                      .slice(0, 3)
                      .join(", ")}
                  </span>
                ) : null}
              </div>

              <Section title="Understanding your situation" body={latestRes.sections.understanding} />
              <SectionList title="Analysis" items={latestRes.sections.analysis} />
              <Section title="Recommended next step" body={latestRes.sections.recommended_next_step} />

              {showGuided ? (
                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-slate-200">
                      Choose a goal:
                    </h3>
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

              <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-400">
                Informational guidance only. Final MOT decisions are made by authorised MOT testing
                centres.
              </div>
            </section>
          ) : null}

          {/* ✅ Optional: Show last successful result when latest is not OK */}
          {showLastOkPanel ? (
            <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/20 p-5">
              <h2 className="text-sm font-semibold text-slate-200">Last successful result</h2>
              <p className="mt-1 text-xs text-slate-400">
                Your latest request did not return status “ok”, so the previous successful result is kept here.
              </p>

              <div className="mt-3">
                <Section title="Understanding" body={lastOkRes!.sections.understanding} />
                <SectionList title="Analysis" items={lastOkRes!.sections.analysis} />
                <Section title="Next step" body={lastOkRes!.sections.recommended_next_step} />
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
