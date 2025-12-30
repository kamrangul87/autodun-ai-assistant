// pages/_app.tsx
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Link from "next/link";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Page content */}
      <Component {...pageProps} />

      {/* Global footer */}
      <footer className="mt-10 border-t border-slate-800 bg-slate-950/60">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-6 text-sm">
          <Link href="/how-it-works" className="text-slate-400 hover:text-slate-200">
            How it works
          </Link>
          <Link href="/pricing" className="text-slate-400 hover:text-slate-200">
            Pricing
          </Link>
          <Link href="/ai-assistant" className="text-slate-400 hover:text-slate-200">
            AI Assistant
          </Link>

          <span className="ml-auto text-slate-500">
            © {new Date().getFullYear()} Autodun
          </span>
        </div>
      </footer>
    </div>
  );
}
