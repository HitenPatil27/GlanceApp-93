# GlanceApp 93 — Live Demo Script & Recording Outline

This document provides a concise 3-minute demo script for presenting the GlanceApp 93 Cloud Briefings MVP to evaluators or stakeholders.

---

## ⏱️ Demo Outline (3 Minutes Total)

| Timestamp | Phase | What to Show & Say |
|---|---|---|
| **0:00 – 0:30** | **The Problem & Architecture** | Explain the multi-region alert fatigue problem. Highlight the 4 required skill domains: Cloud, Ranking, Gen-AI, and Mobile. |
| **0:30 – 1:15** | **Ingestion & AI Briefings** | Trigger simulated streams (Infra, Deployments, App Errors). Show live ranked items with AI explanations generated in real-time. |
| **1:15 – 2:00** | **Event Deep-Dive & Audit** | Click on the top-ranked incident. Show the 4-factor math breakdown (Severity, Recency, Frequency, Blast Radius) and the append-only audit trail. |
| **2:00 – 2:35** | **Operator Feedback Loop (Bonus)** | Open the Weight Tuner. Adjust sliders (e.g. prioritize Blast Radius or Recency) and click "Apply". Show instant re-scoring and re-ranking across all events. |
| **2:35 – 3:00** | **Mobile Responsiveness & Cloud** | Switch to mobile view (inspect dev tools or smartphone) and highlight Docker/Cloud deployment readiness. |

---

## 🎙️ Step-by-Step Speaker Script

### Step 1: Introduction (0:00 – 0:30)
> *"Hello! Today we are demonstrating **GlanceApp 93**, an intelligent cloud incident briefing system built in under 6 hours. Modern multi-region cloud systems produce massive volumes of alerts, causing operator fatigue. GlanceApp 93 uses a 4-factor scoring model combined with Generative AI to prioritize what truly matters and provide actionable incident briefings."*

### Step 2: Stream Ingestion & Live Briefings (0:30 – 1:15)
1. Open the UI at `http://localhost:8000` (or `http://localhost:5173`).
2. Click **"Simulate Streams"** (or click **"🚀 Ingest Demo Stream"**).
3. Select **"🌟 All 3 Sources (Mixed)"** with **15 Events** and click **"Send Events"**.
> *"Here we see events ingesting in real time from three separate streams: infrastructure resource monitors, CI/CD deployment pipelines, and application error trackers.*
> *Each incoming event is automatically scored across 4 dimensions: severity, recency decay, alert frequency, and blast radius across regions and services.*
> *The top-ranked incidents receive concise 1–2 sentence AI briefings generated via our Hugging Face Qwen 2.5 integration, telling operators exactly what went wrong and what action to take."*

### Step 3: Event Deep-Dive & Audit Trail (1:15 – 2:00)
1. Click on the **#1 Ranked Incident Card**.
2. Show the **"Score & Gen AI Analysis"** tab.
3. Switch to the **"Raw Payload"** and **"Event Audit"** tabs.
> *"Clicking on any incident opens the detailed breakdown. Notice the exact mathematical scoring weights, the raw JSON payload, and the append-only audit trail that logs the event's lifecycle from ingestion to scoring, AI explanation, and delivery."*

### Step 4: Operator Feedback Loop (Bonus Feature) (2:00 – 2:35)
1. Navigate to the **"Weight Tuner"** tab (or mobile bottom tab).
2. Click on the preset **"🌐 Blast Radius / Cascade (50% Blast)"** (or drag the Blast Radius slider to 0.70).
3. Click **"Apply Weights & Re-Rank System"**.
4. Switch back to **"Live Briefings"**.
> *"Now let's demonstrate the PRD bonus feature: the Operator Feedback Loop. When operating under different conditions—such as a suspected regional outage—operators can adjust ranking weights. When we increase the Blast Radius weight to 50% and click Apply, the backend instantly normalizes the weights and re-scores every event in memory, dynamically re-ranking the entire dashboard."*

### Step 5: Mobile UX & Wrap-Up (2:35 – 3:00)
1. Toggle browser device toolbar to mobile viewport (iPhone 14 / Pixel 7).
2. Scroll through cards and demonstrate the bottom navigation bar.
> *"The entire experience is 100% mobile-responsive with thumb-friendly navigation, allowing on-call engineers to triage incidents from anywhere. The project is fully containerized with Docker and ready for cloud deployment with zero external database dependencies. Thank you!"*

---

## 🛠️ Verification & Replay Commands

To replay or demonstrate via command-line:

```bash
# 1. Start Server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. Ingest Simulated Streams from CLI
python -m simulator.stream_sender --rounds 2 --batch-size 10

# 3. View Health and Results
curl http://localhost:8000/api/health
curl http://localhost:8000/api/briefings
```
