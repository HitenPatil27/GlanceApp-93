"""
Gen AI Explanation layer for GlanceApp 93.

Uses the Hugging Face Inference API (via the official AsyncInferenceClient) to
generate short natural-language explanations for top-ranked cloud events.

Design notes
------------
The request path never blocks on the LLM. `/api/briefings` fills explanations
from cache instantly (falling back to a deterministic template when nothing is
cached yet) and schedules real generation in the background. The next poll picks
up the LLM text. This keeps the triage endpoint well inside the PRD's 5-second
budget while still delivering genuine Gen AI output — the previous version wrapped
a blocking client in `asyncio.wait_for(..., 4.0)`, and since real HF latency is
~3–6s under concurrency, every call was cancelled and silently downgraded to the
template. Cancelled threads also kept running and their responses were discarded.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import time
from collections import OrderedDict
from typing import Iterable, Optional

from dotenv import load_dotenv
from huggingface_hub import AsyncInferenceClient

from app.audit import AuditAction, audit_logger
from app.models import ExplanationSource, ScoredEvent
from app.store import store

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HF_API_TOKEN: str = os.getenv("HF_API_TOKEN", "").strip()
HF_MODEL: str = os.getenv("HF_MODEL", "Qwen/Qwen2.5-72B-Instruct").strip()

# Per-request ceiling for a single LLM call. Generous because generation happens
# off the request path; a slow model degrades freshness, not API latency.
HF_TIMEOUT: float = float(os.getenv("HF_TIMEOUT", "20"))
# Cap in-flight LLM calls. Firing 15 at once makes the shared HF router queue
# them and inflates per-call latency for everyone.
HF_CONCURRENCY: int = max(int(os.getenv("HF_CONCURRENCY", "4")), 1)
MAX_CACHE_ENTRIES = 2_000
MAX_EXPLANATION_CHARS = 400

# Circuit breaker. An exhausted quota or a revoked token fails identically on
# every call, so without this the UI's 8-second poll would fire a doomed HF
# request for every un-explained event, forever.
BREAKER_FAILURE_THRESHOLD = 5           # consecutive transient failures
BREAKER_TRANSIENT_COOLDOWN = 60.0       # seconds
BREAKER_FATAL_COOLDOWN = 900.0          # seconds, for auth / quota / bad-model
FATAL_STATUS_CODES = {401, 402, 403, 404}


# ---------------------------------------------------------------------------
# HF Client (singleton, lazily created)
# ---------------------------------------------------------------------------

_hf_client: Optional[AsyncInferenceClient] = None
_semaphore = asyncio.Semaphore(HF_CONCURRENCY)

# Event ids currently being generated, so concurrent polls don't duplicate work.
_inflight: set[str] = set()

# Counters surfaced via /api/health for demo transparency.
_counters = {"genai": 0, "fallback": 0, "errors": 0, "cache_hits": 0}


def genai_enabled() -> bool:
    """True when a Hugging Face token is configured."""
    return bool(HF_API_TOKEN)


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

_breaker: dict[str, object] = {"failures": 0, "open_until": 0.0, "reason": None}


def _breaker_open() -> bool:
    return time.monotonic() < float(_breaker["open_until"])


def _open_breaker(cooldown: float, reason: str) -> None:
    _breaker["open_until"] = time.monotonic() + cooldown
    _breaker["reason"] = reason
    logger.error(
        "Gen AI circuit breaker open for %.0fs — falling back to templates. Reason: %s",
        cooldown, reason,
    )


def _record_failure(exc: Exception) -> None:
    status_code = getattr(getattr(exc, "response", None), "status_code", None)
    _breaker["failures"] = int(_breaker["failures"]) + 1

    if status_code in FATAL_STATUS_CODES:
        # 401/403 = bad or revoked token, 402 = inference credits exhausted,
        # 404 = model not served. Retrying every 8 seconds cannot fix any of them.
        _open_breaker(
            BREAKER_FATAL_COOLDOWN,
            f"HTTP {status_code} from the HF router (token or quota problem)",
        )
    elif int(_breaker["failures"]) >= BREAKER_FAILURE_THRESHOLD:
        _open_breaker(
            BREAKER_TRANSIENT_COOLDOWN,
            f"{_breaker['failures']} consecutive failures ({type(exc).__name__})",
        )


def _record_success() -> None:
    _breaker["failures"] = 0
    _breaker["open_until"] = 0.0
    _breaker["reason"] = None


def genai_available() -> bool:
    """True when Gen AI is configured *and* the circuit breaker is closed."""
    return genai_enabled() and not _breaker_open()


def genai_status() -> str:
    if not genai_enabled():
        return "disabled: HF_API_TOKEN not set"
    if _breaker_open():
        return f"degraded: {_breaker['reason']}"
    return "available"


def _get_hf_client() -> Optional[AsyncInferenceClient]:
    """Lazy-init the async HF client."""
    global _hf_client
    if not genai_enabled():
        return None
    if _hf_client is None:
        _hf_client = AsyncInferenceClient(token=HF_API_TOKEN, timeout=HF_TIMEOUT)
    return _hf_client


async def close_client() -> None:
    """Release the underlying HTTP session on shutdown."""
    global _hf_client
    if _hf_client is not None:
        try:
            await _hf_client.close()
        except Exception:  # pragma: no cover - best effort cleanup
            logger.debug("Error closing HF client", exc_info=True)
        _hf_client = None


def stats() -> dict:
    """Snapshot of Gen AI activity for the health endpoint."""
    return {
        "enabled": genai_enabled(),
        "available": genai_available(),
        "status": genai_status(),
        "model": HF_MODEL if genai_enabled() else None,
        "explanations_from_llm": _counters["genai"],
        "explanations_from_template": _counters["fallback"],
        "llm_errors": _counters["errors"],
        "cache_hits": _counters["cache_hits"],
        "cache_size": len(_explanation_cache),
        "in_flight": len(_inflight),
        "concurrency_limit": HF_CONCURRENCY,
        "timeout_seconds": HF_TIMEOUT,
    }


# ---------------------------------------------------------------------------
# Cache (bounded LRU)
# ---------------------------------------------------------------------------

_explanation_cache: "OrderedDict[str, str]" = OrderedDict()


def _cache_key(event: ScoredEvent) -> str:
    # Score is bucketed to 2dp: re-ranking nudges scores slightly but should not
    # invalidate a perfectly good briefing and trigger a fresh LLM call.
    raw = f"{event.id}|{event.severity.value}|{round(event.score, 2)}|{event.title}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> Optional[str]:
    if key in _explanation_cache:
        _explanation_cache.move_to_end(key)
        return _explanation_cache[key]
    return None


def _cache_put(key: str, value: str) -> None:
    _explanation_cache[key] = value
    _explanation_cache.move_to_end(key)
    while len(_explanation_cache) > MAX_CACHE_ENTRIES:
        _explanation_cache.popitem(last=False)


def clear_cache() -> None:
    _explanation_cache.clear()
    _inflight.clear()
    for key in _counters:
        _counters[key] = 0
    _record_success()  # also resets the circuit breaker


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

def _build_messages(event: ScoredEvent) -> list[dict]:
    """Build OpenAI-compatible messages for the chat completions API."""
    bd = event.score_breakdown
    f = event.score_factors
    user_content = (
        f"Cloud event details:\n"
        f"  Title: {event.title}\n"
        f"  Source: {event.source.value}\n"
        f"  Severity: {event.severity.value}\n"
        f"  Region: {event.region or 'N/A'}\n"
        f"  Service: {event.service or 'N/A'}\n"
        f"  Age: {f.age_minutes:.0f} minutes\n"
        f"  Similar alerts in 5m window: {f.similar_events_in_window}\n"
        f"  Spread: {f.services_in_region} service(s) in this region, "
        f"{f.regions_for_service} region(s) for this service\n"
        f"  Priority score: {event.score:.2f} "
        f"(severity={bd.severity:.2f}, recency={bd.recency:.2f}, "
        f"frequency={bd.frequency:.2f}, blast_radius={bd.blast_radius:.2f})\n\n"
        f"Write a concise 1-2 sentence explanation of why this event matters "
        f"and what action the operator should consider."
    )
    return [
        {
            "role": "system",
            "content": "You are a concise SRE assistant for a cloud operations team. "
                       "Respond with exactly 1-2 sentences. No bullet points, no headers, "
                       "no preamble.",
        },
        {"role": "user", "content": user_content},
    ]


# ---------------------------------------------------------------------------
# Fallback template-based explanation
# ---------------------------------------------------------------------------

def template_explanation(event: ScoredEvent) -> str:
    """Rule-based fallback so the demo never fails."""
    severity_label = event.severity.value.upper()
    region_part = f" in {event.region}" if event.region else ""
    service_part = f" affecting {event.service}" if event.service else ""

    if event.score >= 0.75:
        urgency = "Requires immediate attention"
    elif event.score >= 0.50:
        urgency = "Should be investigated soon"
    else:
        urgency = "Monitor for escalation"

    f = event.score_factors
    evidence = []
    if f.similar_events_in_window >= 2:
        evidence.append(f"{f.similar_events_in_window} similar alerts in the last 5 minutes")
    if f.regions_for_service > 1:
        evidence.append(f"spread across {f.regions_for_service} regions")
    if f.services_in_region > 2:
        evidence.append(f"{f.services_in_region} services impacted in-region")
    evidence_part = f" Signals: {'; '.join(evidence)}." if evidence else ""

    return (
        f"{severity_label} priority: {event.title}{region_part}{service_part}. "
        f"Scored {event.score:.2f} — {urgency}.{evidence_part}"
    )


# ---------------------------------------------------------------------------
# HF API call
# ---------------------------------------------------------------------------

def _sanitise(text: str) -> str:
    """Trim the model's output to a single clean paragraph."""
    text = text.strip()
    # Some models wrap the answer in quotes or prefix it with a label.
    text = re.sub(r"^(explanation|answer|response)\s*:\s*", "", text, flags=re.IGNORECASE)
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1].strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) > MAX_EXPLANATION_CHARS:
        text = text[:MAX_EXPLANATION_CHARS].rsplit(" ", 1)[0] + "…"
    return text


async def _call_hf_api(event: ScoredEvent) -> Optional[str]:
    """Call the HF Inference API. Returns generated text, or None on any failure."""
    client = _get_hf_client()
    if client is None or _breaker_open():
        return None

    try:
        async with _semaphore:
            response = await asyncio.wait_for(
                client.chat_completion(
                    messages=_build_messages(event),
                    model=HF_MODEL,
                    max_tokens=120,
                    temperature=0.5,
                ),
                timeout=HF_TIMEOUT,
            )
    except asyncio.TimeoutError as exc:
        _counters["errors"] += 1
        logger.warning("HF request timed out after %.0fs for event %s", HF_TIMEOUT, event.id)
        _record_failure(exc)
        return None
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        _counters["errors"] += 1
        logger.warning("HF request failed for event %s: %s: %s", event.id, type(exc).__name__, exc)
        _record_failure(exc)
        return None

    choices = getattr(response, "choices", None) or []
    if not choices:
        logger.warning("HF returned no choices for event %s", event.id)
        return None

    message = getattr(choices[0], "message", None)
    text = _sanitise(getattr(message, "content", None) or "")
    if not text:
        return None

    _record_success()
    logger.info("Gen AI explanation for %s (%d chars)", event.id, len(text))
    return text


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def apply_cached_explanations(events: Iterable[ScoredEvent]) -> list[ScoredEvent]:
    """Fill explanations from cache, else a template. Never touches the network.

    This is what the briefings endpoint uses, so it always responds immediately.
    """
    applied: list[ScoredEvent] = []
    for event in events:
        cached = _cache_get(_cache_key(event))
        if cached:
            if event.explanation != cached or event.explanation_source != ExplanationSource.GENAI:
                store.set_explanation(event.id, cached, ExplanationSource.GENAI)
            event.explanation = cached
            event.explanation_source = ExplanationSource.GENAI
            _counters["cache_hits"] += 1
        elif not event.explanation:
            fallback = template_explanation(event)
            event.explanation = fallback
            event.explanation_source = ExplanationSource.FALLBACK
            store.set_explanation(event.id, fallback, ExplanationSource.FALLBACK)
        applied.append(event)
    return applied


async def generate_explanation(event: ScoredEvent) -> tuple[str, ExplanationSource]:
    """Generate (or reuse) an explanation for one event, awaiting the LLM."""
    key = _cache_key(event)
    cached = _cache_get(key)
    if cached:
        _counters["cache_hits"] += 1
        return cached, ExplanationSource.GENAI

    text = await _call_hf_api(event)
    if text:
        _cache_put(key, text)
        _counters["genai"] += 1
        audit_logger.log(
            AuditAction.EXPLAINED,
            event_id=event.id,
            detail=f"Gen AI ({HF_MODEL}): {text[:120]}",
        )
        return text, ExplanationSource.GENAI

    fallback = template_explanation(event)
    _counters["fallback"] += 1
    audit_logger.log(
        AuditAction.EXPLAINED,
        event_id=event.id,
        detail=f"Template fallback: {fallback[:120]}",
    )
    return fallback, ExplanationSource.FALLBACK


async def explain_event(event: ScoredEvent) -> str:
    """Generate an explanation for a single event and persist it. Awaits the LLM."""
    text, source = await generate_explanation(event)
    event.explanation = text
    event.explanation_source = source
    store.set_explanation(event.id, text, source)
    return text


async def refresh_explanations(events: list[ScoredEvent], top_n: int = 10) -> None:
    """Background task: upgrade the top N events to real Gen AI explanations.

    Skips events already carrying LLM text and events another task is handling.
    Results are written straight into the store so the next poll serves them.
    """
    if not genai_available() or top_n <= 0:
        return

    pending = [
        ev for ev in events[:top_n]
        if ev.explanation_source != ExplanationSource.GENAI and ev.id not in _inflight
    ]
    if not pending:
        return

    for ev in pending:
        _inflight.add(ev.id)

    try:
        results = await asyncio.gather(
            *(generate_explanation(ev) for ev in pending),
            return_exceptions=True,
        )
        for ev, result in zip(pending, results):
            if isinstance(result, BaseException):
                logger.warning("Explanation task failed for %s: %s", ev.id, result)
                continue
            text, source = result
            store.set_explanation(ev.id, text, source)
    finally:
        for ev in pending:
            _inflight.discard(ev.id)
