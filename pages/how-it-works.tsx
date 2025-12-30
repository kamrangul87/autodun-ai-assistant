import Head from "next/head";

export default function HowItWorks() {
  return (
    <>
      <Head>
        <title>How Autodun AI Works</title>
        <meta
          name="description"
          content="Learn how Autodun AI delivers MOT intelligence, EV charging insights, and used car guidance using intent-based decision routing."
        />
      </Head>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold text-white">
          How Autodun AI Works
        </h1>

        <p className="mt-4 text-slate-300 leading-7">
          Autodun AI is a decision-focused automotive intelligence system.
          It does not behave like a generic chatbot. Instead, it routes each
          question into a specialised workflow and produces structured,
          explainable recommendations.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-white">
          What problem Autodun AI solves
        </h2>

        <ul className="mt-4 list-disc pl-5 text-slate-300 space-y-2">
          <li>Understanding MOT risk and readiness before booking a test</li>
          <li>Interpreting confusing MOT history and repeated advisories</li>
          <li>Estimating likely repair exposure on older vehicles</li>
          <li>Making safer used-car buying decisions</li>
          <li>Finding nearby EV charging options with clear next steps</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold text-white">
          Intent-based routing (not generic chat)
        </h2>

        <p className="mt-4 text-slate-300 leading-7">
          When a user submits a query, Autodun AI first classifies the intent.
          Each intent triggers a dedicated analysis path instead of a single
          free-form chat response.
        </p>

        <ul className="mt-4 list-disc pl-5 text-slate-300 space-y-2">
          <li>
            <strong className="text-white">MOT Intelligence</strong> — risk,
            readiness, repair planning, and cost exposure
          </li>
          <li>
            <strong className="text-white">EV Charging Readiness</strong> —
            nearby chargers by postcode with practical guidance
          </li>
          <li>
            <strong className="text-white">Used-Car Buying</strong> —
            inspection guidance and MOT pattern analysis
          </li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold text-white">
          Structured, explainable outputs
        </h2>

        <p className="mt-4 text-slate-300 leading-7">
          Autodun AI always returns deterministic, structured outputs such as:
        </p>

        <ul className="mt-4 list-disc pl-5 text-slate-300 space-y-2">
          <li>Risk scores and readiness indicators</li>
          <li>Clear “Fix now” vs “Monitor” actions</li>
          <li>Estimated cost ranges (where applicable)</li>
          <li>Direct routing to the correct Autodun tool</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold text-white">
          Designed for trust and decision support
        </h2>

        <p className="mt-4 text-slate-300 leading-7">
          Autodun AI is designed to support decisions — not replace professional
          inspections or MOT testing. Outputs are explainable, consistent, and
          focused on helping drivers understand risk before spending money.
        </p>
      </main>
    </>
  );
}
