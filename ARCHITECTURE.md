# GlanceApp 93 — Architecture & Skill Ownership Note

## 1. System Overview

**GlanceApp 93** is a mobile-first cloud incident briefing and triage system designed to eliminate alert fatigue and surface high-urgency multi-region infrastructure issues. It continuously ingests simulated JSON event streams, applies a 4-factor mathematical scoring model, generates natural-language briefings via Gen AI, and delivers a mobile-first responsive operator experience with a real-time weight adjustment feedback loop.

---

## 2. Team & Skill Ownership Matrix

Per the project specification, the 4 core domains are structured across explicit skill boundaries and team member ownership:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                GLANCEAPP 93 ARCHITECTURE                              │
├──────────────────┬───────────────────┬──────────────────────┬──────────────────────────┤
│ 1. BACKEND/CLOUD │    2. RANKING     │      3. GEN AI       │      4. MOBILE UI        │
│ (Shivam Chaudhry)│   (Hiten Patil)   │    (Hiten Patil)     │     (Prateek Singh)      │
├──────────────────┼───────────────────┼──────────────────────┼──────────────────────────┤
│ • FastAPI Async  │ • 4-Factor Model  │ • Hugging Face API   │ • Responsive React SPA   │
│ • Docker Multi-  │ • Exponential     │ • Qwen 2.5-72B       │ • Real-time Dashboards   │
│   stage Build      Recency Decay     │ • SRE Prompt Engine  │ • Interactive Weight     │
│ • In-Memory Store│ • Blast Radius    │ • MD5 Hash Caching   │   Tuner (Operator Loop)  │
│ • Append-Only      Cross-Region Calc │ • Robust Rule-Based  │ • Event Detail & Audit   │
│   Audit Trail    │ • Dynamic Runtime   Fallback Engine      │   Timeline Inspector     │
│ • Render/Docker    Feedback Loop     │                      │ • Mobile Bottom Nav      │
│   Compose Ready  │   (POST/feedback) │                      │                          │
└──────────────────┴───────────────────┴──────────────────────┴──────────────────────────┘
```

| Skill Domain | Contributor | Owned Responsibilities & Implementation Details |
|---|---|---|
| **Cloud & Backend** | **Shivam Chaudhry** | • **FastAPI Backend (`app/main.py`)**: Asynchronous REST API serving ingestion, briefings, audit, and weight tuning endpoints.<br>• **State & Memory (`app/store.py`, `app/audit.py`)**: Thread-safe in-memory store with indexing by source, service, and region; append-only audit trail logging every state transition.<br>• **Containerization & Deployment**: Multi-stage `Dockerfile`, `docker-compose.yml`, `Procfile`, and `render.yaml` for zero-friction cloud deployment.<br>• **SLA & Reliability**: Sub-100ms batch ingestion pipeline and 28-test automated smoke test suite. |
| **Ranking Engine** | **Hiten Patil** | • **Multi-Factor Scoring Engine (`app/scoring.py`)**: Calculates composite score $S \in [0.0, 1.0]$ using: $$S = (w_1 \times \text{Sev}) + (w_2 \times \text{Rec}) + (w_3 \times \text{Freq}) + (w_4 \times \text{Blast})$$<br>• **Exponential Recency Decay**: $\text{Score}_{\text{rec}} = e^{-\lambda \cdot \Delta t}$ with $\lambda = 0.05/\text{min}$.<br>• **Frequency Window**: Counts alert bursts for matching source/severity over rolling 5-minute windows.<br>• **Blast Radius**: Measures affected unique services and regions.<br>• **Operator Feedback Loop (PRD Bonus)**: `POST /api/feedback` normalizes weights ($\sum w_i = 1.0$) and re-ranks all historical events in memory in under 50ms. |
| **Gen AI** | **Hiten Patil** | • **LLM Inference (`app/explainer.py`)**: Uses Hugging Face `InferenceClient` targeting `Qwen/Qwen2.5-72B-Instruct` (or configured model).<br>• **Role-Tailored SRE Prompting**: Constrained 1–2 sentence prompt generating root-cause rationale and operator guidance.<br>• **Async Concurrency & Caching**: Batched parallel inference (`asyncio.gather`) with MD5 content-hash caching.<br>• **Deterministic Fallback**: Automatic rule-based template generation if the remote LLM API is unavailable, guaranteeing zero demo failure. |
| **Mobile UI / UX** | **Prateek Singh** | • **React SPA Dashboard (`frontend/`)**: Mobile-first responsive UI built with Vite and custom glassmorphic CSS tokens.<br>• **Operator Experience**: Rank badges, color-coded severity pulses, dynamic score breakdown mini-bars, and AI briefing callouts.<br>• **Interactive Weight Tuner**: Real-time slider controls with normalized percentage visualizer and strategy presets.<br>• **Stream Simulator & Reset**: In-browser modal trigger for sending 3 streams of synthetic events.<br>• **Mobile Thumb Navigation**: Fixed bottom navigation bar optimized for handheld smartphone interaction. |

---

## 3. Data Pipeline & SLA

```
[Simulated Streams] ──HTTP POST──► [Ingestion Layer] ──► [Event Store & Audit Logger]
 (Infra, Deploy, Error)             (FastAPI)                (Thread-Safe Memory)
                                                                     │
                                                                     ▼
[Mobile React SPA]  ◄──HTTP GET─── [Gen AI Explainer] ◄── [Scoring / Ranking Engine]
 (Ranked Briefings +               (HF Qwen 2.5 / Cache)      (4-Factor Multi-Weight)
  Interactive Tuner)
```

- **Batch Processing Latency**: < 100ms for scoring 15-event batches; < 2.5s for complete concurrent Gen AI generation.
- **Resilience**: Graceful degradation to template generation if Hugging Face API limits or latency are encountered.
- **Audit Logging**: Append-only log recording every lifecycle event (`ingested`, `scored`, `explained`, `served`, `weights_updated`, `rescored`, `reset`).
