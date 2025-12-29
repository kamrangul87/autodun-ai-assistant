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
  sections?: {
    understanding?: string;
    analysis?: string[];
    recommended_next_step?: string;
  };
  actions?: AgentAction[];
  meta?: { request_id?: string; tool_calls?: Array<{ name: string; ok: boolean; ms: number }> };
  error?: string;
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
    prompt: "MOT help: my car is 10 years old with 120k miles — what should I check before MOT?",
    hint: "Adds age + mileage to reduce uncertainty",
  },
  {
    label: "EV charging near me",
    prompt: "chargers near SW1A 1AA",
    hint: "Adds postcode so the EV tool can return results",
  },
  {
    label: "Used car checks",
    prompt: "I’m buying a used car — what should I check before purchase and in MOT history?",
    hint: "Clarifies the buying workflow",
  },
];

/** -------------------------
 * Helpers: parsing signals from analysis text
 * ------------------------ */
function findFirstMatch(texts: string[], re: RegExp): string | null {
  for (const t of texts) {
    const m = t.match(re);
    if (m) return m[0];
  }
  return null;
}

function parseRisk(texts: string[]) {
  const m = findFirstMatch(texts, /Risk score:\s*\d{1,3}\/100\s*\((HIGH|MEDIUM|LOW)\)/i);
  if (!m) return null;

  const scoreMatch = m.match(/Risk score:\s*(\d{1,3})\/100/i);
  const bandMatch = m.match(/\((HIGH|MEDIUM|LOW)\)/i);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;
  const band = bandMatch ? (bandMatch[1].toUpperCase() as "HIGH" | "MEDIUM" | "LOW") : null;

  if (score === null || !band) return null;
  return { score, band };
}

function parseReplacement(texts: string[]) {
  const m = findFirstMatch(texts, /Recommended replacement type:\s*(EV|HYBRID|ICE)/i);
  if (!m) return null;
  const type = m.split(":")[1].trim().toUpperCase() as "EV" | "HYBRID" | "ICE";
  return { type };
}

function parseDecision(texts: string[]) {
  const m = findFirstMatch(texts, /Decision:\s*(REPLACE|KEEP|CONSIDER_REPLACING)/i);
  if (!m) return null;
  const value = m.split(":")[1].trim().toUpperCase() as "REPLACE" | "KEEP" | "CONSIDER_REPLACING";
  return { value };
}

function parseReadiness(texts: string[]) {
  const m = findFirstMatch(texts, /(Readiness score|MOT readiness):\s*\d{1,3}\/100/i);
  if (!m) return null;
  const scoreMatch = m.match(/:\s*(\d{1,3})\/100/i);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;
  if (score === null) return null;
  const band = score >= 75 ? "GOOD" : score >= 50 ? "OK" : "POOR";
  return { score, band };
}

function safeText(s?: string) {
  return (s || "").trim();
}

function buildCopyText(res: AgentResponse | null) {
  if (!res?.sections) return "";
  const u = safeText(res.sections.understanding);
  const a = Array.isArray(res.sections.analysis) ? res.sections.analysis : [];
  const n = safeText(res.sections.recommended_next_step);

  const lines: string[] = [];
  if (u) lines.push(`Understanding:\n${u}\n`);
  if (a.length) lines.push(`Analysis:\n${a.join("\n")}\n`);
  if (n) lines.push(`Recommended next step:\n${n}\n`);
  return lines.join("\n");
}

function badgeForStatus(status: AgentStatus) {
  if (status === "ok") return "OK";
  if (status === "needs_clarification") return "Needs clarification";
  if (status === "out_of_scope") return "Out of scope";
  return "Error";
}

function intentLabel(intent: AgentIntent) {
  switch (intent) {
    case "mot_preparation":
      return "MOT Intelligence";
    case "ev_charging_readiness":
      return "EV Charging";
    case "used_car_buyer":
      return "Used Car";
    default:
      return "Out of Scope";
  }
}

function ScoreCard({
  title,
  value,
  sub,
  tone = "neutral",
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "border-emerald-700/40 bg-emerald-950/30"
      : tone === "warn"
      ? "border-amber-700/40 bg-amber-950/30"
      : tone === "bad"
      ? "border-red-700/40 bg-red-950/30"
      : "border-slate-800 bg-slate-950/30";

  return (
    <div className={`rounded-2xl border p-4 ${toneCls}`}>
      <div className="text-xs font-semibold text-slate-300">{title}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

function ResultPanel({
  title,
  data,
  loading,
  showGuided,
  onGuidedPick,
}: {
  title: string;
  data: AgentResponse;
  loading: boolean;
  showGuided: boolean;
  onGuidedPick: (prompt: string) => void;
}) {
  const sections = data.sections || {};
  const analysis = Array.isArray(sections.analysis) ? sections.analysis : [];
  const actions = Array.isArray(data.actions) ? data.actions : [];

  const risk = parseRisk(analysis);
  const readiness = parseReadiness(analysis);
  const decision = parseDecision(analysis);
  const replacement = parseReplacement(analysis);

  return (
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>

        {data?.meta?.tool_calls?.length ? (
          <span className="text-xs text-slate-400">
            Trace:{" "}
            {data.meta.tool_calls
              .map((t) => `${t.name}${t.ok ? "" : "(!)"} (${t.ms}ms)`)
              .slice(0, 3)
              .join(", ")}
          </span>
        ) : null}
      </div>

      {(risk || readiness || decision || replacement) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {risk ? (
            <ScoreCard
              title="Risk"
              value={`${risk.score}/100 (${risk.band})`}
              sub="Derived from MOT history patterns"
              tone={risk.band === "HIGH" ? "bad" : risk.band === "MEDIUM" ? "warn" : "good"}
            />
          ) : (
            <ScoreCard title="Risk" value="—" sub="Not returned yet" tone="neutral" />
          )}

          {readiness ? (
            <ScoreCard
              title="MOT Readiness"
              value={`${readiness.score}/100 (${readiness.band})`}
              sub="How prepared the vehicle is for test"
              tone={readiness.band === "GOOD" ? "good" : readiness.band === "OK" ? "warn" : "bad"}
            />
          ) : (
            <ScoreCard title="MOT Readiness" value="—" sub="Not returned yet" tone="neutral" />
          )}

          {decision ? (
            <ScoreCard
              title="Decision"
              value={decision.value}
              sub="Keep vs replace recommendation"
              tone={decision.value === "KEEP" ? "good" : decision.value === "CONSIDER_REPLACING" ? "warn" : "bad"}
            />
          ) : (
            <ScoreCard title="Decision" value="—" sub="Not returned yet" tone="neutral" />
          )}

          {replacement ? (
            <ScoreCard
              title="Replacement Type"
              value={replacement.type}
              sub="EV vs Hybrid vs ICE"
              tone={replacement.type === "EV" ? "good" : replacement.type === "HYBRID" ? "warn" : "neutral"}
            />
          ) : (
            <ScoreCard title="Replacement Type" value="—" sub="Not returned yet" tone="neutral" />
          )}
        </div>
      ) : null}

      <Section title="Understanding your situation" body={safeText(sections.understanding)} />

      <SectionList title="Analysis" items={analysis} />

      <Section title="Recommended next step" body={safeText(sections.recommended_next_step)} />

      {showGuided ? (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-slate-200">
              Not sure what you mean? Choose a goal:
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
                onClick={() => onGuidedPick(c.prompt)}
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
          {actions.length ? (
            actions.map((a) => (
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
            ))
          ) : (
            <>
              <a
                href="https://mot.autodun.com/"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Open MOT Predictor
              </a>
              <a
                href="https://ev.autodun.com/"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Open EV Charger Finder
              </a>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-400">
        Informational guidance only. Final MOT decisions are made by authorised MOT testing centres.
      </div>
    </section>
  );
}

export default function AIAssistantPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Always keep the LATEST response here (even errors)
  const [res, setRes] = useState<AgentResponse | null>(null);

  // ✅ Keep last successful result separately (never replaces the latest)
  const [lastGood, setLastGood] = useState<AgentResponse | null>(null);

  const [err, setErr] = useState<string | null>(null);

  const canRun = useMemo(() => text.trim().length >= 6 && !loading, [text, loading]);

  async function runAgent(overrideText?: string) {
    const finalText = (overrideText ?? text).trim();
    if (finalText.length < 3) return;

    setErr(null);
    setLoading(true);

    // ✅ Clear only the visible error message, but DO NOT force fallback to old result
    // We still show the last response until the new one arrives (better UX).
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

      // ✅ Always set latest response (even if r.ok is false)
      setRes(data);

      if (!r.ok) {
        const msg =
          data?.error ||
          data?.sections?.recommended_next_step ||
          "Request failed. Please try again.";
        setErr(msg);
        return;
      }

      // ✅ If successful, update lastGood
      if (data?.status === "ok") setLastGood(data);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
      // ✅ Set a latest error response so UI shows error (not old result)
      setRes({
        status: "error",
        intent: "unknown_out_of_scope",
        sections: {
          understanding: "We could not complete the analysis.",
          analysis: ["Network or server error occurred while running the agent."],
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

  async function copyReport() {
    // ✅ Copy the LATEST response (not lastGood)
    const toCopy = buildCopyText(res);
    if (!toCopy) return;
    try {
      await navigator.clipboard.writeText(toCopy);
      setErr("Copied report to clipboard.");
      setTimeout(() => setErr(null), 1200);
    } catch {
      setErr("Could not copy. Please select and copy manually.");
      setTimeout(() => setErr(null), 1600);
    }
  }

  function clearAll() {
    setText("");
    setRes(null);
    setErr(null);
  }

  const showGuided =
    !!res && (res.status === "out_of_scope" || res.intent === "unknown_out_of_scope");

  const showingOldBecauseLatestFailed =
    !!res && res.status !== "ok" && !!lastGood;

  return (
    <>
      <Head>
        <title>Autodun AI Assistant</title>
        <meta
          name="description"
          content="Autodun AI Assistant — routes users to MOT Predictor and EV Finder with structured guidance."
        />
      </Head>

      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <header className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Autodun AI Assistant</h1>

              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">
                Beta
              </span>

              {res?.intent ? (
                <span className="rounded-full border border-slate-800 bg-slate-950/30 px-3 py-1 text-xs text-slate-200">
                  {intentLabel(res.intent)}
                </span>
              ) : null}

              {res?.status ? (
                <span className="rounded-full border border-slate-800 bg-slate-950/30 px-3 py-1 text-xs text-slate-200">
                  {badgeForStatus(res.status)}
                </span>
              ) : null}

              {res?.meta?.request_id ? (
                <span className="ml-auto text-xs text-slate-500">
                  Request: {res.meta.request_id}
                </span>
              ) : null}
            </div>

            <p className="mt-2 text-slate-300">
              Tell your goal — the assistant routes you to the right Autodun tool and explains the decision.
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
                  onClick={() => {
                    setText(ex);
                    runAgent(ex);
                  }}
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
                disabled={!res || !res.sections}
                className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              >
                Copy report
              </button>

              {err ? <p className="ml-auto text-sm text-red-300">{err}</p> : null}
            </div>
          </section>

          {/* ✅ Latest result always shown */}
          {res ? (
            <>
              {showingOldBecauseLatestFailed ? (
                <div className="mt-4 rounded-2xl border border-amber-700/40 bg-amber-950/30 p-4 text-sm text-amber-200">
                  Latest request did not return an OK result. Showing latest response, and your last successful result is displayed below.
                </div>
              ) : null}

              <ResultPanel
                title="Latest result"
                data={res}
                loading={loading}
                showGuided={showGuided}
                onGuidedPick={(prompt) => {
                  setText(prompt);
                  runAgent(prompt);
                }}
              />
            </>
          ) : null}

          {/* ✅ If latest is not OK, show lastGood separately */}
          {res && res.status !== "ok" && lastGood ? (
            <ResultPanel
              title="Last successful result"
              data={lastGood}
              loading={loading}
              showGuided={false}
              onGuidedPick={() => {}}
            />
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
      <p className="mt-2 text-sm leading-6 text-slate-200">{body}</p>
    </div>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  if (!Array.isArray(items) || items.length === 0) return null;
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
