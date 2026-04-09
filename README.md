<div align="center">

# ⚡ Autodun AI Assistant

### Structured automotive intelligence for UK drivers — not a chatbot.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-ai.autodun.com-00d48a?style=for-the-badge&logo=vercel&logoColor=white)](https://ai.autodun.com)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.1-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06b6d4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)

> Ask about MOT risk, EV charging near you, or buying a used car.  
> Get a structured, explainable answer — not a paragraph of guesses.

</div>

---

## What Is This?

Autodun AI Assistant is an **intent-routing automotive intelligence layer** built on top of real UK vehicle data. It classifies a driver's natural language question into one of three specialised workflows, runs a dedicated analysis pipeline for that workflow, and returns a deterministic, structured response — with risk scores, fix/monitor decisions, and direct tool links.

It is **not** a general-purpose chatbot. Every output is explainable, consistent, and actionable.

**Part of the [Autodun](https://autodun.com) ecosystem:**

| Tool | URL | What it does |
|---|---|---|
| AI Assistant | [ai.autodun.com](https://ai.autodun.com) | Classifies + routes your vehicle question |
| MOT Predictor | [mot.autodun.com](https://mot.autodun.com) | Full MOT history risk analysis |
| EV Finder | [ev.autodun.com](https://ev.autodun.com) | EV charging station map |

---

## Features

### Intent Classification & Routing

User input is parsed by a keyword + regex classifier that detects one of three intents:

- **`mot_preparation`** — triggered by MOT keywords, VRM patterns (`AB12 CDE`), mileage/age mentions
- **`ev_charging_readiness`** — triggered by EV/charger keywords or a detected UK postcode
- **`used_car_buyer`** — triggered by purchase/buying intent signals
- **`unknown_out_of_scope`** — clearly out of domain (visa, health, finance, etc.)

Each intent routes to its own dedicated API handler — not a shared prompt template.

### MOT Intelligence (7-Layer Analysis Pipeline)

When a VRM (vehicle registration mark) is detected, the pipeline calls the **DVSA MOT History API** and runs a layered analysis chain:

| Layer | What it computes |
|---|---|
| 1 — Risk Scoring | Composite 0–100 risk score from age, mileage, latest result, repeat defect themes |
| 2 — Fix vs Monitor | Per-theme decision (`FIX NOW` / `MONITOR`) with `HIGH` / `MEDIUM` confidence |
| 3 — Theme Classification | Groups defects into: `tyres`, `brakes`, `suspension`, `emissions`, `corrosion`, `exhaust` |
| 4 — MOT Readiness Score | Probability-of-pass estimate based on pattern severity |
| 5 — Repair Cost Estimation | Estimated cost band per repair category |
| 6 — Ownership Outlook | Repair vs. replace signal based on cumulative cost exposure |
| 7 — Structured Output | Formatted `understanding` / `analysis[]` / `recommended_next_step` response |

Without a VRM, the system falls back to a risk signal based on user-provided vehicle age and mileage.

### EV Charging Readiness

- Extracts a UK postcode from natural language (`"near SW1A 1AA"` or `"sw1a1aa"`)
- Geocodes it via [postcodes.io](https://postcodes.io)
- Fetches live EV station data from the Autodun EV Finder API (or Supabase)
- Ranks nearby stations by Haversine distance (configurable radius, default 10 mi)
- Returns top 5 stations: name, address, distance, connector types, power ratings
- Applies contextual follow-up logic (rapid vs. slow, trip vs. daily charging intent)

### Used Car Buyer Intelligence

- Detects VRM in query and pre-fills MOT Predictor deep-link for full history review
- Returns a structured pre-purchase checklist: V5C, MOT pattern, service history, cold-start, bodywork, test drive
- Flags seller red flags and negotiation tips derived from recurring MOT advisory themes
- Routes to MOT Predictor with VRM embedded for full history analysis

### Deep-Link Support

Supports `?intent=mot&vrm=ML58FOU` query parameters — the MOT Predictor can hand off directly to the AI Assistant with context pre-filled and the analysis auto-triggered.

---

## Architecture

```
User Input (natural language)
        │
        ▼
┌─────────────────────────────────────────────────┐
│           Intent Classifier  (run.ts)           │
│   Keyword signals · VRM regex · Postcode regex  │
│   Age/mileage patterns · OOS blocklist          │
└────────────┬──────────────┬─────────────────────┘
             │              │              │
             ▼              ▼              ▼
    mot_preparation  ev_charging   used_car_buyer
             │              │              │
             ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  DVSA MOT    │ │ postcodes.io │ │ Static rules │
    │  History API │ │ geocoding    │ │ + VRM lookup │
    │              │ │              │ │              │
    │  7-Layer     │ │ Haversine    │ │ Checklist    │
    │  Analysis    │ │ distance     │ │ generation   │
    │  Pipeline    │ │ ranking      │ │              │
    └──────────────┘ └──────────────┘ └──────────────┘
             │              │              │
             └──────────────┴──────────────┘
                            │
                            ▼
               ┌─────────────────────────┐
               │   Structured Response   │
               │  {                      │
               │    status,              │
               │    intent,              │
               │    sections: {          │
               │      understanding,     │
               │      analysis[],        │
               │      recommended_next   │
               │    },                   │
               │    actions[],           │
               │    meta: {              │
               │      request_id,        │
               │      tool_calls[]       │
               │    }                    │
               │  }                      │
               └─────────────────────────┘
                            │
                            ▼
               Next.js Frontend (React 19)
               Dark UI · Risk badges
               Copy-to-clipboard · Deep-links
```

### Key Design Decisions

- **No shared prompt template.** Each intent has its own isolated handler and analysis logic.
- **Deterministic by default.** Outputs are structured TypeScript objects, not raw LLM text. AI reasoning is layered on top of rule-based analysis where determinism matters.
- **Abort + request sequencing.** Client-side `AbortController` and monotonic sequence counters prevent stale results on rapid re-queries.
- **Always JSON-safe.** Every API handler guarantees a valid JSON response on every code path — the UI never crashes on `.json()`.
- **Graceful degradation.** No VRM? Fall back to age/mileage. No postcode? Ask for one. No stations found? Widen the radius suggestion.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16.1.1](https://nextjs.org) (Pages Router) |
| UI Runtime | [React 19](https://react.dev) |
| Language | TypeScript 5 (strict mode) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + CSS custom properties |
| MOT Data | [DVSA MOT History API](https://dvsa.gov.uk) (live, authenticated) |
| Geocoding | [postcodes.io](https://postcodes.io) (open, no key required) |
| EV Stations | Autodun EV station feed (`ev.autodun.com/api/stations`) |
| EV Stations (alt.) | [Supabase](https://supabase.com) Postgres (optional high-volume source) |
| Deployment | [Vercel](https://vercel.com) (edge-compatible, serverless functions) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Local Setup

```bash
# Clone the repository
git clone https://github.com/kamrangul87/autodun-ai-assistant.git
cd autodun-ai-assistant

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values (see Environment Variables below)

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root redirects to `/ai-assistant`.

### Build for Production

```bash
npm run build
npm run start
```

---

## Environment Variables

Create `.env.local` at the project root:

```bash
# ── DVSA MOT History API ─────────────────────────────────────────────────────
# Required for VRM-based MOT intelligence (Layers 1–7)
# Apply at: https://dvsa.gov.uk/services/mot-history-api
MOT_API_KEY=your_dvsa_api_key_here
MOT_CLIENT_ID=your_dvsa_client_id_here
MOT_CLIENT_SECRET=your_dvsa_client_secret_here

# ── EV Station Data ───────────────────────────────────────────────────────────
# Optional: override the default EV station endpoint
# Defaults to: https://ev.autodun.com/api/stations
EV_FINDER_STATIONS_URL=https://ev.autodun.com/api/stations

# ── Supabase (Optional — high-volume EV station source) ──────────────────────
EV_SUPABASE_URL=https://your-project.supabase.co
EV_SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

> **Note:** The `postcodes.io` geocoding service requires no key. The EV station endpoint defaults to the Autodun public feed if `EV_FINDER_STATIONS_URL` is not set. The assistant's used-car and non-VRM MOT workflows function without any API keys.

---

## Project Structure

```
autodun-ai-assistant/
├── pages/
│   ├── _app.tsx                  # Global layout: sticky nav header + footer
│   ├── _document.tsx             # HTML document shell
│   ├── index.tsx                 # Redirects → /ai-assistant
│   ├── ai-assistant.tsx          # Main UI: hero, input card, result card
│   ├── how-it-works.tsx          # Intent routing explainer with feature cards
│   ├── pricing.tsx               # Pricing tiers + Pro waitlist form
│   └── api/
│       └── agent/
│           ├── run.ts            # Main router + MOT 7-layer analysis pipeline
│           ├── ev.ts             # EV charging readiness handler
│           └── used.ts           # Used car buyer intelligence handler
├── src/
│   ├── lib/
│   │   ├── agent/
│   │   │   └── decision.ts       # Standalone intent classifier (keyword + regex)
│   │   └── tools/
│   │       └── evFinder.ts       # EV station fetcher, normaliser, Haversine ranker
│   └── styles/
│       └── globals.css           # CSS custom properties + Tailwind v4 import
├── docs/
│   └── WHAT-WE-DID.md            # Project work log
├── public/
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## API Reference

### `POST /api/agent/run`

Main entry point. Classifies intent and executes the appropriate workflow.

**Request:**
```json
{
  "text": "MOT intelligence for ML58FOU",
  "context": {
    "locale": "en-GB",
    "timezone": "Europe/London"
  }
}
```

**Response:**
```json
{
  "status": "ok",
  "intent": "mot_preparation",
  "sections": {
    "understanding": "VRM ML58FOU detected. Full MOT intelligence running...",
    "analysis": [
      "Risk score: 62/100 (MEDIUM)",
      "Repeat theme: brakes (3 of last 4 tests)",
      "FIX NOW: brake discs — estimated £180–£320",
      "MONITOR: suspension bushes — advisory only, 2 tests"
    ],
    "recommended_next_step": "Book with a brake specialist before expiry."
  },
  "actions": [
    {
      "label": "Open MOT Predictor",
      "href": "https://mot.autodun.com/?vrm=ML58FOU",
      "type": "primary"
    }
  ],
  "meta": {
    "request_id": "agt_abc123def456",
    "tool_calls": [
      { "name": "dvsa_mot_history", "ok": true, "ms": 312 }
    ]
  }
}
```

**Status values:** `ok` · `needs_clarification` · `out_of_scope` · `error`

### `POST /api/agent/ev`

EV-specific handler. Extracts UK postcode → geocodes → fetches stations → ranks by Haversine distance.

### `POST /api/agent/used`

Used-car handler. Returns structured pre-purchase checklist, red flags, and negotiation tips. Deep-links MOT Predictor with VRM if detected.

---

## Contributing

Contributions are welcome for UI, tooling, documentation, and non-AI logic. Please read the following before submitting a PR:

1. **Do not modify** `pages/api/agent/` routing or analysis logic without opening an issue first.
2. **Do not commit** `.env.local` or any real API keys.
3. Match the existing TypeScript strict mode — no untyped `any` in new code without justification.
4. All API handlers must guarantee a valid JSON response on every code path.

```bash
# Fork, then clone your fork
git clone https://github.com/your-username/autodun-ai-assistant.git

# Create a feature branch
git checkout -b feat/your-feature-name

# Make your changes and commit
git commit -m "feat: clear description of what changed and why"

# Push and open a PR
git push origin feat/your-feature-name
```

---

## Roadmap

- [ ] Pro tier: saved vehicles, MOT expiry reminders, push notifications
- [ ] Full historical MOT trend analysis across ownership lifetime
- [ ] Repair cost forecasting bands with regional pricing
- [ ] B2B: fleet-level risk dashboard for councils and dealerships
- [ ] Public API access for third-party integrations

---

## License

MIT © [Autodun](https://autodun.com)

---

## Built by

**[Autodun](https://autodun.com)** — AI vehicle intelligence for UK drivers.

| | |
|---|---|
| Main site | [autodun.com](https://autodun.com) |
| AI Assistant | [ai.autodun.com](https://ai.autodun.com) |
| MOT Predictor | [mot.autodun.com](https://mot.autodun.com) |
| EV Finder | [ev.autodun.com](https://ev.autodun.com) |

---

<div align="center">
<sub>Built with TypeScript, Next.js 16, and real UK vehicle data.<br>No hallucinations — structured, explainable outputs every time.</sub>
</div>
