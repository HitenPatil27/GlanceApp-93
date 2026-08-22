# GlanceApp 93 — Mobile Cloud Briefings & Incident Triage System

An intelligent, mobile-ready cloud briefings platform built for multi-region SaaS engineering teams. Ingests simulated multi-region JSON event streams, ranks incidents using a 4-factor mathematical scoring model, generates concise natural-language briefings using Gen AI, and provides an operator dashboard with real-time ranking weight adjustment.

---

## 👥 Team & Skill Ownership

| Contributor | Domain & Responsibilities | Key Deliverables |
|---|---|---|
| **Hiten Patil** | **Gen-AI & Ranking Engine** | • Hugging Face Inference integration (`Qwen/Qwen2.5-72B-Instruct`)<br>• SRE-tailored prompt engineering with deterministic template fallback<br>• 4-factor composite scoring model ($w_1\text{Sev} + w_2\text{Rec} + w_3\text{Freq} + w_4\text{Blast}$)<br>• Exponential recency decay ($\lambda = 0.05/\text{min}$) & cross-region blast radius logic<br>• MD5 content-hash caching layer & dynamic re-ranking engine |
| **Shivam Chaudhry** | **Backend & Cloud Infrastructure** | • Asynchronous FastAPI backend (`app/main.py`) & Pydantic schemas<br>• Thread-safe in-memory store with secondary indexes (`app/store.py`)<br>• Append-only processing audit logging system (`app/audit.py`)<br>• Production multi-stage `Dockerfile`, `docker-compose.yml`, `Procfile`, `render.yaml`<br>• Sub-100ms batch ingestion pipeline & 28-test automated smoke suite |
| **Prateek Singh** | **Mobile UI & Operator Experience** | • Mobile-first responsive React SPA dashboard (`frontend/`)<br>• Thumb-friendly bottom navigation bar & glassmorphic design system<br>• Live incident feed with rank badges, score breakdown bars, and severity pulses<br>• Interactive Weight Tuner with 100% normalized distribution visualizer (PRD Bonus)<br>• Modal deep-dive inspector, audit trail explorer, and stream simulator modal |

---

## 🌟 Key Features

- **📡 Multi-Stream Ingestion**: Ingests JSON event streams across 3 realistic sources over HTTP:
  1. `infra-monitor`: CPU, Memory, Disk, Network latency spikes across multi-region hosts
  2. `deploy-pipeline`: Service releases, rollbacks, and failed CI/CD pipeline deployments
  3. `error-tracker`: 5xx errors, HTTP 502/503 bursts, exceptions, and database deadlocks
- **⚖️ 4-Factor Weighted Ranking Model**:
  $$\text{Score} = (w_1 \times \text{Severity}) + (w_2 \times \text{Recency}) + (w_3 \times \text{Frequency}) + (w_4 \times \text{Blast Radius})$$
  - **Severity ($w_1=0.35$)**: Critical (1.0), High (0.75), Medium (0.50), Low (0.25)
  - **Recency ($w_2=0.25$)**: Exponential decay $\text{Score}_{\text{rec}} = e^{-\lambda \cdot \Delta t}$ with $\lambda = 0.05/\text{min}$
  - **Frequency ($w_3=0.20$)**: Rolling 5-minute alert burst detection
  - **Blast Radius ($w_4=0.20$)**: Multi-service and cross-region cascade footprint
- **🧠 Gen AI Incident Briefings**: Uses Hugging Face Inference API (`Qwen/Qwen2.5-72B-Instruct`) with SRE-tailored prompt engineering, MD5 caching, and an automated rule-based template fallback for 100% uptime.
- **🎛️ Operator Feedback Loop (PRD Bonus Feature)**: Dynamic weight tuner with live normalization ($\sum w_i = 1.0$), strategy presets, and instant sub-50ms system-wide re-ranking (`POST /api/feedback`).
- **📋 Processing Audit Trail**: Append-only log recording every lifecycle event (`ingested`, `scored`, `explained`, `served`, `weights_updated`, `rescored`, `reset`).
- **📱 Mobile-First React SPA**: Responsive dark-mode dashboard with thumb navigation, live search, multi-source filters, and detailed score inspection modals.
- **☁️ Cloud & Container Ready**: Multi-stage Dockerfile, Docker Compose, Procfile, and Render.yaml blueprints.

---

## 🏛️ System Architecture

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

---

## 🚀 Quick Start Guide

### Option 1: Unified Server (FastAPI + Built React SPA on Port 8000)

```bash
# 1. Install Python Dependencies
pip install -r requirements.txt

# 2. Build Frontend
cd frontend && npm install && npm run build && cd ..

# 3. Start Application
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

### Option 2: Run with Docker Compose

```bash
# Build and launch unified container
docker-compose up --build
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

### Option 3: Development Mode (Hot-Reload)

```bash
# Terminal 1: Backend API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: React Frontend (Vite)
cd frontend
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 🧪 Ingesting Simulated Events

### Via UI:
Click the **"Simulate Streams"** button in the header (or **"🚀 Ingest Demo Stream"**) and pick a stream source and batch size.

### Via Command Line:
```bash
# Ingest 3 rounds of 15 simulated events each (interval 2.0s)
python -m simulator.stream_sender --rounds 3 --batch-size 15 --interval 2.0
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/events/ingest` | Ingest and score a batch of raw events |
| `POST` | `/api/events/simulate` | Trigger synthetic event generation |
| `POST` | `/api/events/reset` | Clear store, cache, and audit log for replay |
| `GET` | `/api/briefings` | Return ranked incidents with Gen AI explanations |
| `GET` | `/api/briefings/{id}` | Get single incident detail with score factor breakdown |
| `GET` | `/api/audit` | View processing audit trail entries |
| `POST` | `/api/feedback` | Adjust ranking weights and re-rank system (PRD Bonus) |
| `GET` | `/api/weights` | Retrieve active ranking weights |
| `POST` | `/api/weights/reset` | Reset weights to defaults (35/25/20/20) |
| `GET` | `/api/health` | Health & system diagnostics endpoint |

Interactive Swagger documentation is available at **[http://localhost:8000/docs](http://localhost:8000/docs)**.

---

## 🛡️ Testing & Verification

Run the full automated test suite:
```bash
python -m pytest -v
```
All **28 smoke and integration tests** validate end-to-end functionality, sub-5-second triage SLA, circuit breakers, weight normalization, and security protections.

---

## 📂 Project Structure

```
├── app/
│   ├── main.py              # FastAPI server, static file delivery, API routes
│   ├── models.py            # Pydantic data schemas & validation
│   ├── scoring.py           # 4-factor ranking engine & dynamic re-scoring
│   ├── explainer.py         # Hugging Face Qwen 2.5 explainer, cache & fallback
│   ├── audit.py             # Append-only audit logger
│   └── store.py             # Thread-safe in-memory event store
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx           # Top header & mobile bottom nav
│   │   │   ├── StatsCards.jsx       # Real-time metrics overview
│   │   │   ├── BriefingCard.jsx     # Ranked card with AI callout & score bars
│   │   │   ├── EventDetailModal.jsx # Deep-dive breakdown & per-event audit
│   │   │   ├── WeightTuner.jsx      # Operator feedback loop & preset tuner
│   │   │   ├── AuditTrail.jsx       # System audit log explorer
│   │   │   ├── ArchitectureView.jsx # Architecture & skill ownership view
│   │   │   └── SimulateModal.jsx    # Stream generator trigger modal
│   │   ├── App.jsx                  # Main dashboard controller & filter logic
│   │   └── index.css                # Glassmorphic cyber design tokens
│   ├── dist/                        # Production build bundle
│   └── package.json
├── simulator/
│   ├── event_generator.py   # 3 synthetic event stream generators
│   └── stream_sender.py     # HTTP batch sender CLI
├── tests/
│   ├── conftest.py          # Pytest fixtures & mock clients
│   └── test_smoke.py        # 28 end-to-end smoke & regression tests
├── Dockerfile               # Multi-stage container definition
├── docker-compose.yml       # Container orchestration
├── Procfile                 # PaaS process file (Render/Railway/Heroku)
├── render.yaml              # Render.com blueprint
├── ARCHITECTURE.md          # Skill ownership documentation
├── DEMO_SCRIPT.md           # 3-minute live presentation guide
├── requirements.txt         # Python dependencies
└── README.md                # Project documentation & team overview
```
