import Head from "next/head";

export default function HowItWorksPage() {
  return (
    <>
      <Head>
        <title>How Autodun AI Works</title>
        <meta
          name="description"
          content="Learn how Autodun AI makes explainable decisions for MOT intelligence, EV charging, and used-car buying."
        />
      </Head>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-slate-900 mb-6">
          How Autodun AI Works
        </h1>

        <p className="text-lg text-slate-700 mb-10">
          Autodun AI is a decision-focused automotive intelligence system.
          It does not behave like a generic chatbot. Instead, it routes
          each question into a specialised workflow and produces structured,
          explainable recommendations.
        </p>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            What problem Autodun AI solves
          </h2>
          <ul className="list-disc list-inside space-y-2 text-slate-700">
            <li>Understanding MOT risk and readiness before booking a test</li>
            <li>Interpreting confusing MOT history and repeated advisories</li>
            <li>Estimating likely repair exposure on older vehicles</li>
            <li>Making safer used-car buying decisions</li>
            <li>Finding nearby EV charging options with clear next steps</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            Intent-based routing (not generic chat)
          </h2>
          <p className="text-slate-700 mb-4">
            When a user submits a query, Autodun AI first classifies the intent.
            Each intent triggers a dedicated analysis path.
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700">
            <li><strong>MOT Intelligence</strong> — risk, readiness, repair planning</li>
            <li><strong>EV Charging Readiness</strong> — nearby chargers by postcode</li>
            <li><strong>Used-Car Buying</strong> — inspection guidance and MOT pattern checks</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            MOT Intelligence — Layered decision model
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-700">
            <li>Vehicle context (age and mileage)</li>
            <li>MOT history pattern detection</li>
            <li>Severity and safety weighting</li>
            <li>Repair cost exposure estimation</li>
            <li>MOT readiness scoring</li>
            <li>Ownership decision support</li>
            <li>Actionable next-step recommendations</li>
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            Explainable scoring (no black box)
          </h2>
          <p className="text-slate-700">
            Autodun AI uses deterministic rules and conservative thresholds.
            Every output includes an explanation such as risk level,
            readiness score, cost range, and recommended actions.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            Safety and limitations
          </h2>
          <p className="text-slate-700">
            Autodun AI provides decision support only. It does not replace
            professional inspections, certified MOT testing, or legal advice.
            When critical data is missing, the system requests clarification
            instead of guessing.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-slate-900 mb-4">
            Versioning and stability
          </h2>
          <p className="text-slate-700">
            This page documents Autodun AI Assistant v1 — a frozen,
            production-ready baseline. Future versions may extend
            capabilities while preserving explainability and consistency.
          </p>
        </section>

        <hr className="border-slate-300 my-12" />

        <p className="text-sm text-slate-500">
          Autodun AI is designed to help drivers make safer, clearer,
          and more informed decisions.
        </p>
      </main>
    </>
  );
}
