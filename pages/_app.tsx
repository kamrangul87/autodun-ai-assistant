// pages/_app.tsx
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Link from "next/link";

function SiteHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundColor: "#070f1a",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 20px",
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        {/* Left: Logo */}
        <a
          href="https://autodun.com"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            fontWeight: 800,
            fontSize: "15px",
            color: "#f0f6ff",
            letterSpacing: "0.06em",
            flexShrink: 0,
          }}
        >
          ⚡ AUTODUN
        </a>

        {/* Center: Nav */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            flex: 1,
            justifyContent: "center",
            overflowX: "auto",
          }}
        >
          {[
            { label: "Home", href: "https://autodun.com", active: false },
            { label: "EV Finder", href: "https://ev.autodun.com", active: false },
            { label: "MOT Predictor", href: "https://mot.autodun.com", active: false },
            { label: "AI Assistant", href: "https://ai.autodun.com", active: true },
            { label: "Blog", href: "https://autodun.com/blog/index.html", active: false },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              style={{
                padding: "6px 11px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: item.active ? 600 : 400,
                color: item.active ? "#00d48a" : "#8899aa",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right: CTA */}
        <a
          href="/pricing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            border: "1px solid #00d48a",
            borderRadius: "8px",
            padding: "7px 14px",
            fontSize: "13px",
            fontWeight: 600,
            color: "#00d48a",
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Pro — Join Waitlist
        </a>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer
      style={{
        backgroundColor: "#050c15",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        marginTop: "60px",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "40px 24px 28px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "32px",
        }}
      >
        {/* Left */}
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: "15px",
              color: "#f0f6ff",
              letterSpacing: "0.06em",
              marginBottom: "8px",
            }}
          >
            ⚡ AUTODUN
          </div>
          <p style={{ fontSize: "13px", color: "#8899aa", lineHeight: "1.6", margin: 0 }}>
            AI vehicle intelligence
            <br />
            for UK drivers
          </p>
        </div>

        {/* Center */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Link href="/how-it-works" style={{ fontSize: "13px", color: "#8899aa", textDecoration: "none" }}>
            How it works
          </Link>
          <Link href="/pricing" style={{ fontSize: "13px", color: "#8899aa", textDecoration: "none" }}>
            Pricing
          </Link>
          <a href="https://autodun.com/privacy" style={{ fontSize: "13px", color: "#8899aa", textDecoration: "none" }}>
            Privacy
          </a>
          <Link href="/how-it-works" style={{ fontSize: "13px", color: "#8899aa", textDecoration: "none" }}>
            About AI
          </Link>
        </div>

        {/* Right */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "10px",
          }}
        >
          <a href="https://ev.autodun.com" style={{ fontSize: "13px", color: "#8899aa", textDecoration: "none" }}>
            EV Finder
          </a>
          <a href="https://mot.autodun.com" style={{ fontSize: "13px", color: "#8899aa", textDecoration: "none" }}>
            MOT Predictor
          </a>
          <a href="https://autodun.com" style={{ fontSize: "13px", color: "#8899aa", textDecoration: "none" }}>
            Autodun.com
          </a>
        </div>
      </div>

      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "16px 24px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          fontSize: "12px",
          color: "#556677",
          textAlign: "center",
        }}
      >
        © 2026 Autodun. All rights reserved.
      </div>
    </footer>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#070f1a", color: "#f0f6ff" }}>
      <SiteHeader />
      <Component {...pageProps} />
      <SiteFooter />
    </div>
  );
}
