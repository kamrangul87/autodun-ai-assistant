import Head from "next/head";
import { useState } from "react";

export default function PricingPage() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;

    // Store in localStorage
    try {
      const existing = JSON.parse(localStorage.getItem("autodun_waitlist") || "[]");
      if (!existing.includes(waitlistEmail)) {
        existing.push(waitlistEmail);
        localStorage.setItem("autodun_waitlist", JSON.stringify(existing));
      }
    } catch (e) {
      // localStorage not available
    }

    setWaitlistSubmitted(true);
    setWaitlistEmail("");
    setTimeout(() => setWaitlistSubmitted(false), 4000);
  }

  return (
    <>
      <Head>
        <title>Autodun Pricing | Free AI Vehicle Tools — Pro Plan Coming Soon</title>
        <meta
          name="description"
          content="Autodun is free to use. Pro plan with deeper MOT insights, saved reports and reminders coming soon at £4.99/month."
        />
        <meta property="og:title" content="Autodun Pricing | Free AI Vehicle Tools — Pro Plan Coming Soon" />
        <meta property="og:description" content="Autodun is free to use. Pro plan with deeper MOT insights, saved reports and reminders coming soon at £4.99/month." />
        <meta property="og:url" content="https://ai.autodun.com/pricing" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://ai.autodun.com/pricing" />
      </Head>

      <main style={{ backgroundColor: "#070f1a", color: "#f0f6ff", minHeight: "100vh" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "60px 24px 80px" }}>

          {/* Header */}
          <header style={{ marginBottom: "60px", textAlign: "center" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "rgba(0,212,138,0.12)",
              border: "1px solid rgba(0,212,138,0.3)",
              borderRadius: "100px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 700,
              color: "#00d48a",
              letterSpacing: "0.06em",
              marginBottom: "20px",
            }}>
              LAUNCH PRICING
            </div>

            <h1 style={{ fontSize: "clamp(32px, 5vw, 44px)", fontWeight: 800, margin: "0 0 16px" }}>
              Lock in early access
            </h1>

            <p style={{ fontSize: "16px", color: "#8899aa", lineHeight: 1.7, maxWidth: "600px", margin: "0 auto" }}>
              Autodun is free today. Pro plan with deeper MOT insights, saved reports, and reminders launches soon at £4.99/month.
            </p>
          </header>

          {/* Pricing Cards */}
          <section style={{ marginBottom: "60px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>

              {/* Free Card */}
              <div style={{
                backgroundColor: "#111f33",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "14px",
                padding: "32px 24px",
                display: "flex",
                flexDirection: "column",
              }}>
                <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>Free</h2>
                <p style={{ fontSize: "14px", color: "#8899aa", margin: "0 0 24px", lineHeight: 1.6 }}>
                  Quick, structured guidance — ideal for one-off checks.
                </p>

                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "12px", color: "#556677", marginBottom: "4px" }}>Price</div>
                  <div style={{ fontSize: "32px", fontWeight: 700, color: "#f0f6ff" }}>£0</div>
                  <div style={{ fontSize: "12px", color: "#556677", marginTop: "4px" }}>Always available</div>
                </div>

                <ul style={{ margin: "0 0 32px", paddingLeft: "20px", listStyle: "disc", fontSize: "14px", color: "#c8d8e8", lineHeight: 1.8, flexGrow: 1 }}>
                  <li>MOT snapshot guidance (VRM-based where available)</li>
                  <li>EV charging readiness near postcode</li>
                  <li>Used-car buying checklist + MOT patterns</li>
                  <li>Clear next-step routing to Autodun tools</li>
                </ul>

                <a
                  href="/ai-assistant"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "transparent",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    padding: "12px 20px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#c8d8e8",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                    e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Start Free
                </a>
              </div>

              {/* Pro Card */}
              <div style={{
                backgroundColor: "#111f33",
                border: "2px solid #00d48a",
                borderRadius: "14px",
                padding: "32px 24px",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                transform: "scale(1.02)",
              }}>
                <div style={{
                  position: "absolute",
                  top: "-12px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "#00d48a",
                  color: "#070f1a",
                  padding: "4px 12px",
                  borderRadius: "100px",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}>
                  MOST POPULAR
                </div>

                <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>Pro</h2>
                <p style={{ fontSize: "14px", color: "#8899aa", margin: "0 0 24px", lineHeight: 1.6 }}>
                  Deeper intelligence, saved reports, and proactive ownership insights.
                </p>

                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "12px", color: "#556677", marginBottom: "4px" }}>Launch pricing</div>
                  <div style={{ fontSize: "32px", fontWeight: 700, color: "#00d48a" }}>£4.99</div>
                  <div style={{ fontSize: "12px", color: "#556677", marginTop: "4px" }}>per month</div>
                </div>

                <ul style={{ margin: "0 0 32px", paddingLeft: "20px", listStyle: "disc", fontSize: "14px", color: "#c8d8e8", lineHeight: 1.8, flexGrow: 1 }}>
                  <li>Full historical trends & recurring defect breakdown</li>
                  <li>Cost forecasting (repair exposure bands)</li>
                  <li>MOT readiness score tracking over time</li>
                  <li>Saved vehicles + downloadable reports</li>
                  <li>Reminders before MOT expiry</li>
                </ul>

                <form onSubmit={handleWaitlist} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    required
                    style={{
                      backgroundColor: "#0d1b2a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      fontSize: "14px",
                      color: "#f0f6ff",
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "#00d48a"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  />
                  <button
                    type="submit"
                    style={{
                      backgroundColor: "#00d48a",
                      color: "#070f1a",
                      fontWeight: 700,
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "14px",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.15s",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#00e5a0"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#00d48a"; }}
                  >
                    {waitlistSubmitted ? "✓ You're on the list!" : "Join Waitlist"}
                  </button>
                </form>
              </div>

              {/* B2B Card */}
              <div style={{
                backgroundColor: "#111f33",
                border: "1px solid rgba(41,121,255,0.25)",
                borderTop: "3px solid #2979ff",
                borderRadius: "14px",
                padding: "32px 24px",
                display: "flex",
                flexDirection: "column",
              }}>
                <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 8px" }}>B2B</h2>
                <p style={{ fontSize: "14px", color: "#8899aa", margin: "0 0 24px", lineHeight: 1.6 }}>
                  For councils and dealerships. Fleet insights and bulk analytics.
                </p>

                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "12px", color: "#556677", marginBottom: "4px" }}>Pricing</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#8899aa" }}>Custom</div>
                  <div style={{ fontSize: "12px", color: "#556677", marginTop: "4px" }}>Contact for details</div>
                </div>

                <ul style={{ margin: "0 0 32px", paddingLeft: "20px", listStyle: "disc", fontSize: "14px", color: "#c8d8e8", lineHeight: 1.8, flexGrow: 1 }}>
                  <li>Bulk dashboards for portfolio view</li>
                  <li>Exportable reports and analytics</li>
                  <li>API access for internal workflows</li>
                  <li>Dedicated support team</li>
                </ul>

                <a
                  href="mailto:hello@autodun.com"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#2979ff",
                    color: "#f0f6ff",
                    fontWeight: 600,
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "14px",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "opacity 0.15s",
                    border: "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  Contact Us
                </a>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section style={{ maxWidth: "700px", margin: "0 auto", padding: "40px 0" }}>
            <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "24px", textAlign: "center" }}>
              Frequently asked
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ backgroundColor: "#111f33", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "16px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f6ff", margin: "0 0 8px" }}>
                  When does Pro launch?
                </h3>
                <p style={{ fontSize: "14px", color: "#8899aa", margin: 0, lineHeight: 1.6 }}>
                  Pro is launching in Q2 2026. Lock in early pricing now by joining the waitlist.
                </p>
              </div>

              <div style={{ backgroundColor: "#111f33", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "16px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f6ff", margin: "0 0 8px" }}>
                  Can I cancel anytime?
                </h3>
                <p style={{ fontSize: "14px", color: "#8899aa", margin: 0, lineHeight: 1.6 }}>
                  Yes. Pro subscriptions can be cancelled anytime with no penalty.
                </p>
              </div>

              <div style={{ backgroundColor: "#111f33", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "16px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f6ff", margin: "0 0 8px" }}>
                  Is Free always free?
                </h3>
                <p style={{ fontSize: "14px", color: "#8899aa", margin: 0, lineHeight: 1.6 }}>
                  Yes. Free tier remains free and available forever with no ads or limits.
                </p>
              </div>
            </div>
          </section>

        </div>
      </main>
    </>
  );
}
