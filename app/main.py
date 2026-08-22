"""
FastAPI application for GlanceApp 93 — Gen AI + Ranking module.

Endpoints
---------
    POST /api/events/ingest    — Receive a batch of events
    POST /api/events/simulate  — Generate + ingest synthetic events
    POST /api/events/reset     — Clear store, audit log and explanation cache
    GET  /api/briefings        — Ranked events with explanations
    GET  /api/briefings/{id}   — Single event detail (waits briefly for real Gen AI)
    GET  /api/audit            — Processing audit trail
    POST /api/feedback         — Adjust ranking weights and re-rank (bonus)
    GET  /api/weights          — Current ranking weights
    POST /api/weights/reset    — Restore default weights
    GET  /api/health           — Health / diagnostics
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import explainer
from app.audit import AuditAction, audit_logger
from app.explainer import (
    apply_cached_explanations,
    explain_event,
    genai_available,
    genai_enabled,
    refresh_explanations,
)
from app.models import (
    AuditEntry,
    BriefingResponse,
    EventBatch,
    EventSource,
    ExplanationSource,
    FeedbackRequest,
    RankingWeights,
    ScoredEvent,
)
from app.scoring import scoring_engine
from app.store import store
from simulator.event_generator import (
    generate_app_error,
    generate_deploy_event,
    generate_event_batch,
    generate_infra_alert,
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# How long a detail request will wait for fresh Gen AI text before giving up and
# returning what it has. Generation is *not* cancelled on timeout — it finishes
# in the background and the next fetch gets the real text.
DETAIL_EXPLAIN_TIMEOUT = float(os.getenv("DETAIL_EXPLAIN_TIMEOUT", "8"))

# Re-scoring the whole store after an ingest keeps the burst and blast-radius
# factors correct for events that arrived *before* the ones correlating with
# them. It is O(n^2) in the worst case, so above this many stored events only the
# new batch is scored — and the audit trail records that it happened rather than
# silently understating older events.
RESCORE_ON_INGEST_LIMIT = int(os.getenv("RESCORE_ON_INGEST_LIMIT", "1500"))

# Strong references to fire-and-forget tasks; without this the event loop can
# garbage-collect a pending task mid-flight.
_background_tasks: set[asyncio.Task] = set()


def _track(task: asyncio.Task) -> asyncio.Task:
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("GlanceApp 93 — Gen AI + Ranking module starting up")
    if genai_enabled():
        logger.info(
            "Gen AI enabled | model=%s | timeout=%.0fs | concurrency=%d",
            explainer.HF_MODEL, explainer.HF_TIMEOUT, explainer.HF_CONCURRENCY,
        )
    else:
        logger.warning(
            "HF_API_TOKEN not set — explanations will use the deterministic "
            "template fallback. Set HF_API_TOKEN in .env to enable Gen AI."
        )
    yield
    for task in list(_background_tasks):
        task.cancel()
    await explainer.close_client()
    logger.info("GlanceApp 93 — shut down cleanly")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="GlanceApp 93 — Cloud Briefings System",
    description=(
        "Cloud briefings MVP: ingest events from three simulated streams, rank them "
        "with a tunable multi-factor model, explain the top items with Gen AI, and "
        "serve a mobile-ready operator UI with a full audit trail."
    ),
    version="1.1.0",
    lifespan=lifespan,
)

# CORS for the Vite dev server and any mobile client.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,  # incompatible with allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Never leak a stack trace or an empty socket to the UI.

    The frontend shows a recoverable error state for any non-2xx JSON response,
    so a structured 500 is far more useful than a dropped connection.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error while processing the request.",
            "error_type": type(exc).__name__,
            "path": request.url.path,
        },
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health", tags=["Health"])
async def health_check():
    """Liveness plus enough diagnostics to debug a demo without server access."""
    return {
        "status": "healthy",
        "module": "gen-ai-ranking",
        "version": app.version,
        "events_stored": store.total_scored(),
        "store": store.stats(),
        "audit_entries": audit_logger.count(),
        "weights": scoring_engine.weights.model_dump(),
        "genai": explainer.stats(),
        "frontend_bundled": FRONTEND_DIST.is_dir(),
    }


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

def _ingest_batch(events: list) -> tuple[list[str], list[dict[str, str]]]:
    """Store a batch, then score it, then reconcile the events around it.

    Order matters. The frequency and blast-radius factors are computed from
    *neighbouring* events, so scoring event #1 before events #2..#N are stored
    would permanently record a burst of size zero for the first alert of an
    incident. Everything is stored first, then scored.

    A single malformed event must not fail the whole batch either, so each is
    handled independently and failures come back per-id.
    """
    ingested_ids: list[str] = []
    failures: list[dict[str, str]] = []

    for event in events:
        try:
            store.add_raw_event(event)
            audit_logger.log(
                AuditAction.INGESTED,
                event_id=event.id,
                detail=f"source={event.source.value} severity={event.severity.value} "
                       f"title={event.title[:60]}",
            )
            ingested_ids.append(event.id)
        except Exception as exc:  # noqa: BLE001 - one bad event can't break the batch
            logger.exception("Failed to ingest event %s", event.id)
            failures.append({"id": event.id, "error": f"{type(exc).__name__}: {exc}"})
            audit_logger.log(
                AuditAction.REJECTED,
                event_id=event.id,
                detail=f"Ingest failed: {type(exc).__name__}: {exc}",
            )

    if not ingested_ids:
        return ingested_ids, failures

    accepted = set(ingested_ids)
    for event in events:
        if event.id not in accepted:
            continue
        try:
            # Loud: one SCORED audit entry per new event, as the PRD's audit
            # trail requirement expects.
            scoring_engine.score_event(event)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to score event %s", event.id)
            failures.append({"id": event.id, "error": f"{type(exc).__name__}: {exc}"})

    total = store.stats()["raw_events"]
    if total <= RESCORE_ON_INGEST_LIMIT:
        # Quiet: refresh earlier events whose burst / blast context just changed,
        # with a single summary audit entry.
        scoring_engine.score_all()
    else:
        audit_logger.log(
            AuditAction.RESCORED,
            detail=f"Store holds {total} events (> {RESCORE_ON_INGEST_LIMIT}); scored only "
                   f"the new batch of {len(ingested_ids)} to stay inside the triage budget",
        )

    return ingested_ids, failures


@app.post("/api/events/ingest", tags=["Ingestion"])
async def ingest_events(batch: EventBatch, background_tasks: BackgroundTasks):
    """Receive a batch of events, store and score them immediately."""
    ingested_ids, failures = _ingest_batch(batch.events)

    logger.info(
        "Ingested %d/%d events (%d failed)",
        len(ingested_ids), len(batch.events), len(failures),
    )

    if ingested_ids and genai_available():
        background_tasks.add_task(
            refresh_explanations, store.get_ranked_events(limit=10), 10
        )

    return {
        "message": f"Ingested {len(ingested_ids)} of {len(batch.events)} events",
        "ingested": len(ingested_ids),
        "failed": len(failures),
        "event_ids": ingested_ids,
        "errors": failures,
    }


@app.post("/api/events/simulate", tags=["Ingestion"])
async def simulate_events(
    background_tasks: BackgroundTasks,
    count: int = Query(15, ge=1, le=100, description="Number of events to generate"),
    source: Optional[EventSource] = Query(
        None,
        description="Optional single source: infra-monitor, deploy-pipeline, error-tracker. "
                    "Omit for a mixed batch across all three streams.",
    ),
):
    """Generate synthetic events and ingest them — the one-click demo path.

    `source` is typed as an enum so an unknown value returns a 422 listing the
    valid options instead of silently falling through to a mixed batch.
    """
    single_generators = {
        EventSource.INFRA_MONITOR: generate_infra_alert,
        EventSource.DEPLOY_PIPELINE: generate_deploy_event,
        EventSource.ERROR_TRACKER: generate_app_error,
    }

    if source is None:
        events = generate_event_batch(count)
    else:
        generator = single_generators[source]
        events = [generator() for _ in range(count)]

    ingested_ids, _ = _ingest_batch(events)
    logger.info("Simulated and ingested %d events", len(ingested_ids))

    if ingested_ids and genai_available():
        background_tasks.add_task(
            refresh_explanations, store.get_ranked_events(limit=10), 10
        )

    return {
        "message": f"Successfully simulated and scored {len(ingested_ids)} events",
        "count": len(ingested_ids),
        "requested": count,
        "source": source.value if source else "mixed",
        "event_ids": ingested_ids,
    }


@app.post("/api/events/reset", tags=["Ingestion"])
async def reset_events():
    """Clear the store, audit log and explanation cache for a clean demo replay."""
    store.clear()
    audit_logger.clear()
    # Without this, a reset followed by a re-ingest would serve stale briefings
    # from the cache for any event id that happened to repeat.
    explainer.clear_cache()
    audit_logger.log(
        AuditAction.RESET,
        detail="Event store, audit log and explanation cache cleared",
    )
    logger.info("Event store, audit log and explanation cache cleared")
    return {"message": "Store, audit log and explanation cache successfully reset"}


# ---------------------------------------------------------------------------
# Briefings
# ---------------------------------------------------------------------------

@app.get("/api/briefings", response_model=BriefingResponse, tags=["Briefings"])
async def get_briefings(
    background_tasks: BackgroundTasks,
    limit: int = Query(20, ge=1, le=100, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    explain_top: int = Query(
        10, ge=0, le=50,
        description="Schedule background Gen AI explanations for the top N events",
    ),
):
    """Return ranked events with explanations, always within the 5s PRD budget.

    Explanations come from the cache (or the deterministic template on a cold
    start) so this endpoint never blocks on the LLM. Real Gen AI text is produced
    in a background task and appears on the next poll — the UI polls every 8s.
    """
    ranked = store.get_ranked_events(limit=limit, offset=offset)
    ranked = apply_cached_explanations(ranked)

    if ranked and explain_top > 0 and genai_available():
        background_tasks.add_task(refresh_explanations, ranked, explain_top)

    audit_logger.log(
        AuditAction.SERVED,
        detail=f"Served {len(ranked)} briefings (offset={offset}, limit={limit})",
    )

    return BriefingResponse(
        briefings=ranked,
        total=store.total_scored(),
        weights=scoring_engine.weights,
    )


@app.get("/api/briefings/{event_id}", response_model=ScoredEvent, tags=["Briefings"])
async def get_briefing_detail(event_id: str):
    """Return one event with its full score breakdown.

    Unlike the list endpoint this waits (briefly) for genuine Gen AI text, since
    the operator explicitly asked for this single item. If the model is slower
    than DETAIL_EXPLAIN_TIMEOUT the generation keeps running in the background
    rather than being thrown away.
    """
    scored = store.get_scored_event(event_id)
    if not scored:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    needs_genai = scored.explanation_source != ExplanationSource.GENAI
    if needs_genai and genai_available():
        task = _track(asyncio.create_task(explain_event(scored)))
        try:
            # shield() so the timeout stops us waiting, not the generation itself.
            await asyncio.wait_for(asyncio.shield(task), timeout=DETAIL_EXPLAIN_TIMEOUT)
        except asyncio.TimeoutError:
            logger.info(
                "Gen AI still generating for %s after %.0fs — serving current text",
                event_id, DETAIL_EXPLAIN_TIMEOUT,
            )
    if not scored.explanation:
        apply_cached_explanations([scored])

    return scored


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

@app.get("/api/audit", response_model=list[AuditEntry], tags=["Audit"])
async def get_audit_trail(
    limit: int = Query(100, ge=1, le=500, description="Max entries to return"),
    event_id: Optional[str] = Query(None, description="Filter by event ID"),
    action: Optional[AuditAction] = Query(None, description="Filter by action type"),
):
    """Return the processing audit trail, newest first."""
    return audit_logger.get_entries(limit=limit, event_id=event_id, action=action)


# ---------------------------------------------------------------------------
# Feedback loop (bonus)
# ---------------------------------------------------------------------------

@app.post("/api/feedback", response_model=RankingWeights, tags=["Feedback"])
async def submit_feedback(feedback: FeedbackRequest):
    """Adjust ranking weights and immediately re-score every stored event."""
    new_weights = scoring_engine.update_weights(feedback)
    rescored = scoring_engine.score_all()
    logger.info("Weights updated; %d events re-scored", len(rescored))
    return new_weights


@app.get("/api/weights", response_model=RankingWeights, tags=["Feedback"])
async def get_weights():
    """Return current ranking weights."""
    return scoring_engine.weights


@app.post("/api/weights/reset", response_model=RankingWeights, tags=["Feedback"])
async def reset_ranking_weights():
    """Restore the documented default weights and re-rank."""
    weights = scoring_engine.reset_weights()
    audit_logger.log(AuditAction.RESET, detail="Ranking weights restored to defaults")
    scoring_engine.score_all()
    return weights


# ---------------------------------------------------------------------------
# Unknown API routes -> JSON 404 (must be declared after every real API route)
# ---------------------------------------------------------------------------

@app.api_route(
    "/api/{unmatched_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def api_not_found(unmatched_path: str):
    """Return a JSON 404 for unknown API paths.

    Without this, the SPA catch-all below answered `/api/typo` with a 200 and
    index.html, so a client-side typo looked like a successful request.
    """
    raise HTTPException(
        status_code=404,
        detail=f"No API endpoint at /api/{unmatched_path}. See /docs for the API surface.",
    )


# ---------------------------------------------------------------------------
# Static frontend delivery
# ---------------------------------------------------------------------------

FRONTEND_DIST = (Path(__file__).resolve().parent.parent / "frontend" / "dist").resolve()
_ASSETS_DIR = FRONTEND_DIST / "assets"

if _ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="static_assets")
elif FRONTEND_DIST.is_dir():
    logger.warning("frontend/dist exists but has no assets/ directory — run `npm run build`")


def _resolve_static(relative_path: str) -> Optional[Path]:
    """Resolve a request path inside frontend/dist, or None if it escapes.

    `os.path.join(dist, full_path)` happily accepted `../../.env`: Starlette
    URL-decodes the path parameter, so `..%2f..%2f.env` reached the handler as a
    traversal and the server returned the project's secrets. Resolving the
    candidate and asserting it stays under dist closes that hole.
    """
    if not relative_path:
        return None
    try:
        candidate = (FRONTEND_DIST / relative_path).resolve()
        candidate.relative_to(FRONTEND_DIST)
    except (ValueError, OSError):
        return None
    return candidate if candidate.is_file() else None


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    """Serve the built SPA, falling back to index.html for client-side routes."""
    if not FRONTEND_DIST.is_dir():
        return JSONResponse(
            {
                "message": "GlanceApp 93 API is running, but the frontend bundle is missing.",
                "hint": "Run `npm install && npm run build` in ./frontend, or use the Vite dev server.",
                "docs": "/docs",
            }
        )

    static_file = _resolve_static(full_path)
    if static_file is not None:
        return FileResponse(static_file)

    index_file = FRONTEND_DIST / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)

    return JSONResponse(
        {
            "message": "GlanceApp 93 API is running. Frontend build is incomplete.",
            "docs": "/docs",
        }
    )
