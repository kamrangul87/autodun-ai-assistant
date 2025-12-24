import Head from "next/head";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    // Auto-open AI Assistant
    window.location.replace("/ai-assistant");
  }, []);

  return (
    <>
      <Head>
        <title>Autodun AI Assistant</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-2xl font-semibold">Opening Autodun AI Assistant…</h1>
          <p className="mt-2 text-slate-300">
            If you are not redirected automatically,{" "}
            <a className="underline" href="/ai-assistant">
              click here
            </a>
            .
          </p>
        </div>
      </main>
    </>
  );
}
