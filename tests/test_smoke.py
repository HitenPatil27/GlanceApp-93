"""
End-to-end smoke tests for GlanceApp 93.

Each test maps to a PRD requirement or to a bug that was found and fixed:
ingest → score → rank → explain → audit, the operator feedback loop, the
sub-5-second triage budget, recoverable error states, and static-file safety.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import pytest

from app import explainer
from app.models import ExplanationSource


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _event(**overrides) -> dict:
    payload = {
        "id": "evt-test-0001",
        "source": "infra-monitor",
        "title": "CPU spike at 97% on payment-service",
        "severity": "critical",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "region": "us-east-1",
        "service": "payment-service",
        "metadata": {"value_percent": 97.0},
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

def test_health_reports_diagnostics(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert body["store"]["raw_events"] == 0
    assert "genai" in body and "weights" in body
    assert set(body["weights"]) == {"severity", "recency", "frequency", "blast_radius"}


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

def test_ingest_aware_timestamp(client):
    res = client.post("/api/events/ingest", json={"events": [_event()]})
    assert res.status_code == 200
    body = res.json()
    assert body["ingested"] == 1
    assert body["failed"] == 0
    assert body["event_ids"] == ["evt-test-0001"]


def test_ingest_naive_timestamp_does_not_crash(client):
    """Regression: a timestamp without an offset used to raise TypeError.

    `can't subtract offset-naive and offset-aware datetimes` in the scoring
    engine returned a 500 *and* poisoned the store, so every later request
    failed too.
    """
    res = client.post(
        "/api/events/ingest",
        json={"events": [_event(id="evt-naive", timestamp="2026-08-22T10:00:00")]},
    )
    assert res.status_code == 200, res.text

    # The poisoned-store part of the bug: a follow-up request must still work.
    assert client.post("/api/events/simulate?count=5").status_code == 200
    assert client.get("/api/briefings").status_code == 200


def test_ingest_rejects_empty_batch(client):
    res = client.post("/api/events/ingest", json={"events": []})
    assert res.status_code == 422


def test_future_timestamp_is_clamped_not_negative(client):
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    client.post("/api/events/ingest", json={"events": [_event(timestamp=future)]})
    detail = client.get("/api/briefings/evt-test-0001").json()
    assert detail["score_factors"]["age_minutes"] == 0.0
    assert detail["score_factors"]["recency"] == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Simulation and ranking
# ---------------------------------------------------------------------------

def test_simulate_and_rank(client):
    res = client.post("/api/events/simulate?count=25")
    assert res.status_code == 200
    assert res.json()["count"] == 25

    body = client.get("/api/briefings?limit=25").json()
    briefings = body["briefings"]
    assert len(briefings) == 25
    assert body["total"] == 25

    scores = [b["score"] for b in briefings]
    assert scores == sorted(scores, reverse=True), "briefings must be ranked by score"
    assert [b["rank"] for b in briefings] == list(range(1, 26))
    assert all(0.0 <= b["score"] <= 1.0 for b in briefings)


def test_simulate_rejects_unknown_source(client):
    res = client.post("/api/events/simulate?count=5&source=not-a-stream")
    assert res.status_code == 422


def test_simulate_single_source(client):
    client.post("/api/events/simulate?count=6&source=error-tracker")
    briefings = client.get("/api/briefings").json()["briefings"]
    assert briefings and all(b["source"] == "error-tracker" for b in briefings)


def test_correlated_events_raise_frequency_and_blast_radius(client):
    """A clustered incident must score above an isolated one on both factors.

    The original blast-radius metric counted every service/region ever seen for
    the event's source, so it saturated at 1.0 for everything and contributed
    nothing to the ranking.
    """
    now = datetime.now(timezone.utc)
    cluster = [
        _event(
            id=f"evt-cluster-{i}",
            title=f"Latency spike on svc-{i}",
            service=f"svc-{i}",
            region="eu-west-1",
            timestamp=(now - timedelta(seconds=30 * i)).isoformat(),
        )
        for i in range(5)
    ]
    isolated = _event(
        id="evt-lonely",
        title="Latency spike on quiet-service",
        service="quiet-service",
        region="ap-south-1",
        timestamp=(now - timedelta(hours=6)).isoformat(),
    )
    res = client.post("/api/events/ingest", json={"events": cluster + [isolated]})
    assert res.status_code == 200

    clustered = client.get("/api/briefings/evt-cluster-0").json()
    lonely = client.get("/api/briefings/evt-lonely").json()

    assert clustered["score_factors"]["similar_events_in_window"] >= 4
    assert lonely["score_factors"]["similar_events_in_window"] == 0
    assert clustered["score_factors"]["blast_radius"] > lonely["score_factors"]["blast_radius"]
    assert lonely["score_factors"]["blast_radius"] == 0.0
    assert clustered["score"] > lonely["score"]


def test_briefings_respond_within_prd_budget(client):
    client.post("/api/events/simulate?count=50")
    start = time.perf_counter()
    res = client.get("/api/briefings?limit=50&explain_top=15")
    elapsed = time.perf_counter() - start
    assert res.status_code == 200
    assert elapsed < 5.0, f"triage took {elapsed:.2f}s, PRD budget is 5s"
    assert all(b["explanation"] for b in res.json()["briefings"])


# ---------------------------------------------------------------------------
# Explanations
# ---------------------------------------------------------------------------

def test_explanations_fall_back_to_template_without_token(client):
    client.post("/api/events/ingest", json={"events": [_event()]})
    briefing = client.get("/api/briefings").json()["briefings"][0]
    assert briefing["explanation_source"] == ExplanationSource.FALLBACK.value
    assert briefing["explanation"]


def test_genai_path_labels_source_honestly(client, monkeypatch):
    """With the LLM reachable, text must be labelled `genai`, not `fallback`."""
    async def fake_call(event):
        return "Payment service is saturated in us-east-1; scale out before checkout fails."

    monkeypatch.setattr(explainer, "HF_API_TOKEN", "test-token")
    monkeypatch.setattr(explainer, "_call_hf_api", fake_call)

    client.post("/api/events/ingest", json={"events": [_event()]})
    detail = client.get("/api/briefings/evt-test-0001").json()

    assert detail["explanation_source"] == ExplanationSource.GENAI.value
    assert "saturated" in detail["explanation"]

    actions = [e["action"] for e in client.get("/api/audit?event_id=evt-test-0001").json()]
    assert "explained" in actions


def test_llm_failure_degrades_to_template(client, monkeypatch):
    async def failing_call(event):
        return None  # mirrors a timeout / HTTP error inside _call_hf_api

    monkeypatch.setattr(explainer, "HF_API_TOKEN", "test-token")
    monkeypatch.setattr(explainer, "_call_hf_api", failing_call)

    client.post("/api/events/ingest", json={"events": [_event()]})
    detail = client.get("/api/briefings/evt-test-0001").json()

    assert detail["explanation_source"] == ExplanationSource.FALLBACK.value
    assert detail["explanation"], "an operator must never see an empty briefing"


def test_reranking_preserves_existing_explanations(client, monkeypatch):
    async def fake_call(event):
        return "Generated once."

    monkeypatch.setattr(explainer, "HF_API_TOKEN", "test-token")
    monkeypatch.setattr(explainer, "_call_hf_api", fake_call)

    client.post("/api/events/ingest", json={"events": [_event()]})
    client.get("/api/briefings/evt-test-0001")

    client.post("/api/feedback", json={
        "severity": 0.1, "recency": 0.7, "frequency": 0.1, "blast_radius": 0.1,
    })

    after = client.get("/api/briefings").json()["briefings"][0]
    assert after["explanation"] == "Generated once."
    assert after["explanation_source"] == ExplanationSource.GENAI.value


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

class _FakeResponse:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


class _FakeHFError(Exception):
    """Mirrors HfHubHTTPError, which carries the failed httpx response."""

    def __init__(self, status_code: int) -> None:
        super().__init__(f"Client error '{status_code}' for url 'https://router.huggingface.co'")
        self.response = _FakeResponse(status_code)


def test_fatal_hf_status_opens_circuit_breaker(client, monkeypatch):
    """A 402 (credits exhausted) must stop the retry storm, not repeat forever.

    Live logs showed the same doomed HF request being re-issued on every 8-second
    UI poll because a permanent failure was treated like a transient one.
    """
    monkeypatch.setattr(explainer, "HF_API_TOKEN", "test-token")
    assert explainer.genai_available() is True

    explainer._record_failure(_FakeHFError(402))

    assert explainer.genai_available() is False
    assert explainer.genai_enabled() is True, "the token is still configured"
    status = client.get("/api/health").json()["genai"]
    assert status["available"] is False
    assert "402" in status["status"]

    # With the breaker open the LLM is never called; briefings still come back.
    calls: list[str] = []

    async def should_not_run(event):
        calls.append(event.id)
        return "must not appear"

    monkeypatch.setattr(explainer, "_call_hf_api", should_not_run)
    client.post("/api/events/ingest", json={"events": [_event()]})
    briefing = client.get("/api/briefings").json()["briefings"][0]

    assert calls == [], "breaker open but the HF client was still called"
    assert briefing["explanation_source"] == ExplanationSource.FALLBACK.value
    assert briefing["explanation"]


def test_transient_failures_open_breaker_only_after_threshold(client, monkeypatch):
    monkeypatch.setattr(explainer, "HF_API_TOKEN", "test-token")

    for _ in range(explainer.BREAKER_FAILURE_THRESHOLD - 1):
        explainer._record_failure(TimeoutError("slow router"))
    assert explainer.genai_available() is True, "one blip must not disable Gen AI"

    explainer._record_failure(TimeoutError("slow router"))
    assert explainer.genai_available() is False

    explainer._record_success()
    assert explainer.genai_available() is True
    assert client.get("/api/health").json()["genai"]["status"] == "available"


# ---------------------------------------------------------------------------
# Feedback loop (PRD bonus)
# ---------------------------------------------------------------------------

def test_feedback_normalises_weights_and_reranks(client):
    now = datetime.now(timezone.utc)
    # Old + critical vs. brand new + low. Which one wins depends on the weights.
    client.post("/api/events/ingest", json={"events": [
        _event(id="evt-old-critical", severity="critical",
               timestamp=(now - timedelta(hours=3)).isoformat()),
        _event(id="evt-new-low", severity="low", service="search-service",
               region="us-west-2", timestamp=now.isoformat()),
    ]})

    severity_first = client.post("/api/feedback", json={
        "severity": 0.9, "recency": 0.05, "frequency": 0.025, "blast_radius": 0.025,
    })
    assert severity_first.status_code == 200
    weights = severity_first.json()
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-3)
    top = client.get("/api/briefings").json()["briefings"][0]
    assert top["id"] == "evt-old-critical"

    recency_first = client.post("/api/feedback", json={
        "severity": 0.05, "recency": 0.9, "frequency": 0.025, "blast_radius": 0.025,
    })
    assert recency_first.status_code == 200
    top = client.get("/api/briefings").json()["briefings"][0]
    assert top["id"] == "evt-new-low", "weight changes must visibly re-rank the feed"


def test_feedback_rejects_all_zero_weights(client):
    res = client.post("/api/feedback", json={
        "severity": 0, "recency": 0, "frequency": 0, "blast_radius": 0,
    })
    assert res.status_code == 422


def test_feedback_rejects_negative_weights(client):
    res = client.post("/api/feedback", json={
        "severity": -1, "recency": 0.5, "frequency": 0.3, "blast_radius": 0.2,
    })
    assert res.status_code == 422


def test_weights_reset(client):
    client.post("/api/feedback", json={
        "severity": 0.9, "recency": 0.05, "frequency": 0.025, "blast_radius": 0.025,
    })
    restored = client.post("/api/weights/reset").json()
    assert restored == {
        "severity": 0.35, "recency": 0.25, "frequency": 0.20, "blast_radius": 0.20,
    }
    assert client.get("/api/weights").json() == restored


# ---------------------------------------------------------------------------
# Audit trail
# ---------------------------------------------------------------------------

def test_audit_trail_records_pipeline_steps(client):
    client.post("/api/events/ingest", json={"events": [_event()]})
    client.get("/api/briefings")

    entries = client.get("/api/audit?limit=100").json()
    actions = {e["action"] for e in entries}
    assert {"ingested", "scored", "served"} <= actions

    per_event = client.get("/api/audit?event_id=evt-test-0001").json()
    assert per_event and all(e["event_id"] == "evt-test-0001" for e in per_event)

    scored_only = client.get("/api/audit?action=scored").json()
    assert scored_only and all(e["action"] == "scored" for e in scored_only)


def test_audit_rejects_unknown_action_filter(client):
    assert client.get("/api/audit?action=teleported").status_code == 422


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

def test_reset_clears_everything(client):
    client.post("/api/events/simulate?count=10")
    assert client.post("/api/events/reset").status_code == 200

    body = client.get("/api/briefings").json()
    assert body["briefings"] == []
    assert body["total"] == 0
    # The reset itself is recorded, so the trail explains the empty feed.
    assert [e["action"] for e in client.get("/api/audit").json()] == ["served", "reset"]


# ---------------------------------------------------------------------------
# Error handling / security
# ---------------------------------------------------------------------------

def test_unknown_event_id_returns_404(client):
    res = client.get("/api/briefings/evt-does-not-exist")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_unknown_api_route_returns_json_404(client):
    """Regression: unknown /api paths used to return 200 + index.html."""
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404
    assert res.headers["content-type"].startswith("application/json")

    assert client.post("/api/also-not-real").status_code == 404


@pytest.mark.parametrize("path", [
    "/..%2f..%2f.env",
    "/%2e%2e%2f%2e%2e%2f.env",
    "/../.env",
    "/..%5c..%5c.env",
    "/assets/../../.env",
])
def test_static_serving_blocks_path_traversal(client, path):
    """Regression: `GET /..%2f..%2f.env` returned 200 with HF_API_TOKEN in it."""
    res = client.get(path)
    assert "HF_API_TOKEN" not in res.text
    assert "hf_" not in res.text
