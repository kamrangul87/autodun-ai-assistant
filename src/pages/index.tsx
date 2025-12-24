import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>Autodun AI Assistant</title>
        <meta name="description" content="Autodun AI Assistant routing page." />
      </Head>

      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-semibold tracking-tight">Autodun AI Assistant</h1>
          <p className="mt-3 text-slate-300">
            Routing agent for MOT preparation, EV charging readiness, and used-car buying checks.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/ai-assistant"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Open AI Assistant
            </a>
            <a
              href="https://mot.autodun.com/"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              MOT Predictor
            </a>
            <a
              href="https://ev.autodun.com/"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              EV Charger Finder
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
