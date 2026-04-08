import Head from "next/head";

export default function HowItWorks() {
  const features = [
    {
      icon: "🎯",
      title: "Intent Classification",
      description: "Your question is classified into MOT, EV, or Used Car workflows automatically",
    },
    {
      icon: "🔄",
      title: "Structured Routing",
      description: "Each intent triggers a dedicated analysis path, not a generic chat",
    },
    {
      icon: "📊",
      title: "Explainable Outputs",
      description: "Risk scores, Fix now vs Monitor actions, cost ranges — all clearly explained",
    },
  ];

  return (
    <>
      <Head>
        <title>How Autodun AI Works | Intent-Routing Automotive Intelligence for UK Drivers</title>
        <meta
          name="description"
          content="Autodun AI classifies your vehicle question and routes it to a specialised workflow — not a generic chatbot. Structured, explainable outputs every time."
        />
        <meta property="og:title" content="How Autodun AI Works | Intent-Routing Automotive Intelligence for UK Drivers" />
        <meta property="og:description" content="Autodun AI classifies your vehicle question and routes it to a specialised workflow — not a generic chatbot. Structured, explainable outputs every time." />
        <meta property="og:url" content="https://ai.autodun.com/how-it-works" />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://ai.autodun.com/how-it-works" />
      </Head>

      <main style={{ backgroundColor: "#070f1a", color: "#f0f6ff" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "60px 24px 80px" }}>

          {/* Header */}
          <section style={{ textAlign: "center", marginBottom: "60px" }}>
            <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 800, margin: "0 0 16px" }}>
              How Autodun AI Works
            </h1>
            <p style={{ fontSize: "16px", color: "#8899aa", lineHeight: 1.7, maxWidth: "560px", margin: "0 auto" }}>
              Autodun AI is a decision-focused automotive intelligence system. It does not behave like a generic chatbot. Instead, it routes each question into a specialised workflow and produces structured, explainable recommendations.
            </p>
          </section>

          {/* Problem Statement */}
          <section style={{ marginBottom: "60px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>What problem Autodun AI solves</h2>
            <ul style={{ margin: 0, paddingLeft: "20px", listStyle: "disc", fontSize: "15px", color: "#c8d8e8", lineHeight: 1.8, display: "flex", flexDirection: "column", gap: "8px" }}>
              <li>Understanding MOT risk and readiness before booking a test</li>
              <li>Interpreting confusing MOT history and repeated advisories</li>
              <li>Estimating likely repair exposure on older vehicles</li>
              <li>Making safer used-car buying decisions</li>
              <li>Finding nearby EV charging options with clear next steps</li>
            </ul>
          </section>

          {/* Feature Cards */}
          <section style={{ marginBottom: "60px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>Intent-based routing (not generic chat)</h2>
            <p style={{ fontSize: "15px", color: "#8899aa", lineHeight: 1.7, marginBottom: "24px" }}>
              When a user submits a query, Autodun AI first classifies the intent. Each intent triggers a dedicated analysis path instead of a single free-form chat response.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
              {features.map((feature) => (
                <div
                  key={feature.title}
                  style={{
                    backgroundColor: "#111f33",
                    border: "1px solid rgba(0,212,138,0.25)",
                    borderTop: "3px solid #00d48a",
                    borderRadius: "12px",
                    padding: "24px",
                  }}
                >
                  <div style={{ fontSize: "32px", marginBottom: "12px" }}>{feature.icon}</div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f0f6ff", margin: "0 0 8px" }}>
                    {feature.title}
                  </h3>
                  <p style={{ fontSize: "14px", color: "#8899aa", lineHeight: 1.6, margin: 0 }}>
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Intent Types */}
          <section style={{ marginBottom: "60px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>Three intent types</h2>
            <ul style={{ margin: 0, paddingLeft: "20px", listStyle: "disc", fontSize: "15px", color: "#c8d8e8", lineHeight: 1.8, display: "flex", flexDirection: "column", gap: "10px" }}>
              <li>
                <strong style={{ color: "#f0f6ff" }}>MOT Intelligence</strong> — risk, readiness, repair planning, and cost exposure
              </li>
              <li>
                <strong style={{ color: "#f0f6ff" }}>EV Charging Readiness</strong> — nearby chargers by postcode with practical guidance
              </li>
              <li>
                <strong style={{ color: "#f0f6ff" }}>Used-Car Buying</strong> — inspection guidance and MOT pattern analysis
              </li>
            </ul>
          </section>

          {/* Outputs */}
          <section style={{ marginBottom: "60px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>Structured, explainable outputs</h2>
            <p style={{ fontSize: "15px", color: "#8899aa", lineHeight: 1.7, marginBottom: "16px" }}>
              Autodun AI always returns deterministic, structured outputs such as:
            </p>
            <ul style={{ margin: 0, paddingLeft: "20px", listStyle: "disc", fontSize: "15px", color: "#c8d8e8", lineHeight: 1.8, display: "flex", flexDirection: "column", gap: "8px" }}>
              <li>Risk scores and readiness indicators</li>
              <li>Clear "Fix now" vs "Monitor" actions</li>
              <li>Estimated cost ranges (where applicable)</li>
              <li>Direct routing to the correct Autodun tool</li>
            </ul>
          </section>

          {/* Trust */}
          <section>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>Designed for trust and decision support</h2>
            <p style={{ fontSize: "15px", color: "#8899aa", lineHeight: 1.7 }}>
              Autodun AI is designed to support decisions — not replace professional inspections or MOT testing. Outputs are explainable, consistent, and focused on helping drivers understand risk before spending money.
            </p>
          </section>

        </div>
      </main>
    </>
  );
}
