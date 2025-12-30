// src/pages/pricing.tsx
import Head from "next/head";

export default function PricingPage() {
  return (
    <>
      <Head>
        <title>Pricing — Autodun</title>
        <meta
          name="description"
          content="Autodun pricing (coming soon): Free vs Pro features for drivers, plus bulk analytics for councils and dealerships."
        />
      </Head>

      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <header className="mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
              Pricing · Coming soon
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Autodun Pro (Coming Soon)
            </h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              Autodun Pro is designed for drivers who want deeper MOT insight, cost forecasting,
              and proactive reminders. Free tools remain available for quick checks.
            </p>
          </header>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h2 className="text-lg font-semibold">Free</h2>
              <p className="mt-2 text-sm text-slate-300">
                Quick, structured guidance — ideal for one-off checks.
              </p>

              <ul className="mt-4 space-y-2 text-sm text-slate-200">
                <li>• MOT snapshot guidance (VRM-based where available)</li>
                <li>• EV charging readiness near postcode</li>
                <li>• Used-car buying checklist + MOT patterns</li>
                <li>• Clear next-step routing to Autodun tools</li>
              </ul>

              <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="text-xs text-slate-400">Price</div>
                <div className="mt-1 text-2xl font-semibold">£0</div>
                <div className="mt-1 text-xs text-slate-400">Always available</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h2 className="text-lg font-semibold">Pro (Planned)</h2>
              <p className="mt-2 text-sm text-slate-300">
                Deeper intelligence, saved reports, and proactive ownership insights.
              </p>

              <ul className="mt-4 space-y-2 text-sm text-slate-200">
                <li>• Full historical trends & recurring defect breakdown</li>
                <li>• Cost forecasting (repair exposure bands)</li>
                <li>• MOT readiness score tracking over time</li>
                <li>• Saved vehicles + downloadable reports</li>
                <li>• Reminders before MOT expiry</li>
              </ul>

              <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="text-xs text-slate-400">Target price (placeholder)</div>
                <div className="mt-1 text-2xl font-semibold">£4.99 / month</div>
                <div className="mt-1 text-xs text-slate-400">Final pricing TBD</div>
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold">For Councils & Dealerships (B2B)</h2>
            <p className="mt-2 text-sm text-slate-300">
              Bulk access and analytics packages are planned for councils and dealerships:
              fleet-level insights, risk signals, and reporting workflows.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="text-sm font-semibold text-slate-200">Bulk dashboards</div>
                <div className="mt-1 text-xs text-slate-400">
                  Portfolio view of MOT patterns and risk signals.
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="text-sm font-semibold text-slate-200">Reporting</div>
                <div className="mt-1 text-xs text-slate-400">
                  Exportable summaries and evidence-friendly reports.
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="text-sm font-semibold text-slate-200">Integrations</div>
                <div className="mt-1 text-xs text-slate-400">
                  Planned API access for internal workflows.
                </div>
              </div>
            </div>

            <div className="mt-6 text-xs text-slate-400">
              Note: Monetisation is currently “design-for-commercialisation” (no payments or accounts in v1).
            </div>
          </section>

          <div className="mt-10">
            <a
              href="/ai-assistant"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              ← Back to AI Assistant
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
