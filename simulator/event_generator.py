"""
Event simulator for GlanceApp 93.

Generates realistic simulated cloud events from three sources:
  1. infra-monitor   — Infrastructure alerts (CPU, memory, disk)
  2. deploy-pipeline — Deployment events (deploys, rollbacks, failures)
  3. error-tracker   — Application errors (exceptions, timeouts, 5xx)

Why the generated stream is deliberately *not* uniform random
-------------------------------------------------------------
With regions and services picked uniformly, real incidents never correlate: the
frequency factor stays near zero and every event's blast radius is identical, so
the ranking collapses to "severity, tie-broken by age" and the demo cannot show
the multi-factor model doing anything. The generator therefore maintains a
rotating "hot spot" (one region + one service under active incident) that a
share of events cluster around, and skews timestamps toward the present so
bursts land inside the 5-minute frequency window.
"""

from __future__ import annotations

import random
import uuid
from datetime import timedelta

from app.models import EventPayload, EventSource, Severity, utc_now

# ---------------------------------------------------------------------------
# Topology
# ---------------------------------------------------------------------------

REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-south-1", "eu-central-1"]
SERVICES = [
    "api-gateway", "auth-service", "billing-service", "notification-service",
    "search-service", "user-service", "order-service", "payment-service",
    "analytics-service", "cdn-edge",
]

# Share of events drawn into the current hot spot, and how many events a hot
# spot survives before a new incident starts somewhere else.
HOTSPOT_BIAS = 0.45
HOTSPOT_LIFETIME = 25

_hotspot: dict[str, object] = {"region": None, "service": None, "remaining": 0}


def _current_hotspot() -> tuple[str, str]:
    """Return the active (region, service) hot spot, rotating it when exhausted."""
    if _hotspot["remaining"] <= 0 or _hotspot["region"] is None:
        _hotspot["region"] = random.choice(REGIONS)
        _hotspot["service"] = random.choice(SERVICES)
        _hotspot["remaining"] = HOTSPOT_LIFETIME
    _hotspot["remaining"] = int(_hotspot["remaining"]) - 1
    return str(_hotspot["region"]), str(_hotspot["service"])


def reset_hotspot() -> None:
    """Force a fresh incident on the next generated event (used by tests)."""
    _hotspot.update({"region": None, "service": None, "remaining": 0})


def _pick_location() -> tuple[str, str]:
    """Pick (region, service), biased toward the active incident."""
    hot_region, hot_service = _current_hotspot()
    roll = random.random()

    if roll < HOTSPOT_BIAS * 0.6:
        # Local cascade: more services failing inside the hot region.
        return hot_region, random.choice(SERVICES)
    if roll < HOTSPOT_BIAS:
        # Cross-region spread: the hot service degrading elsewhere too.
        return random.choice(REGIONS), hot_service
    # Unrelated background noise.
    return random.choice(REGIONS), random.choice(SERVICES)


def _random_ts(max_age_minutes: int = 15):
    """Timestamp within the last N minutes, skewed heavily toward now.

    A triangular distribution with mode 0 puts most events in the last few
    minutes, so same-source/same-severity bursts actually fall inside the
    scoring engine's 5-minute frequency window.
    """
    seconds = random.triangular(0, max_age_minutes * 60, 0)
    return utc_now() - timedelta(seconds=seconds)


# ---------------------------------------------------------------------------
# Stream generators
# ---------------------------------------------------------------------------

def generate_infra_alert() -> EventPayload:
    """Simulate an infrastructure monitoring alert."""
    region, service = _pick_location()
    metric = random.choice(["CPU", "Memory", "Disk I/O", "Network latency"])
    value = round(random.uniform(50, 99), 1)
    severity = (
        Severity.CRITICAL if value > 90
        else Severity.HIGH if value > 80
        else Severity.MEDIUM if value > 65
        else Severity.LOW
    )

    return EventPayload(
        id=f"evt-{uuid.uuid4().hex[:8]}",
        source=EventSource.INFRA_MONITOR,
        title=f"{metric} spike at {value}% on {service} ({region})",
        severity=severity,
        timestamp=_random_ts(15),
        region=region,
        service=service,
        metadata={
            "metric": metric.lower().replace(" ", "_"),
            "value_percent": value,
            "threshold": 80.0,
            "host": f"{service}-{random.randint(1, 5)}.{region}.internal",
        },
    )


def generate_deploy_event() -> EventPayload:
    """Simulate a deployment pipeline event."""
    region, service = _pick_location()
    version = f"v{random.randint(1, 5)}.{random.randint(0, 20)}.{random.randint(0, 99)}"
    status = random.choice(["started", "succeeded", "failed", "rolling_back"])
    severity = (
        Severity.CRITICAL if status == "rolling_back"
        else Severity.HIGH if status == "failed"
        else Severity.LOW
    )

    return EventPayload(
        id=f"evt-{uuid.uuid4().hex[:8]}",
        source=EventSource.DEPLOY_PIPELINE,
        title=f"Deploy {version} of {service} — {status}",
        severity=severity,
        timestamp=_random_ts(20),
        region=region,
        service=service,
        metadata={
            "version": version,
            "status": status,
            "rollback_available": status in ("failed", "rolling_back"),
            "deployer": random.choice(["ci-bot", "dev-team", "hotfix-pipeline"]),
        },
    )


def generate_app_error() -> EventPayload:
    """Simulate an application error tracker event."""
    region, service = _pick_location()
    error_type = random.choice([
        "NullPointerException", "TimeoutError", "ConnectionRefused",
        "HTTP 502 Bad Gateway", "HTTP 503 Service Unavailable",
        "OutOfMemoryError", "RateLimitExceeded", "DatabaseDeadlock",
    ])
    count = random.randint(1, 500)
    severity = (
        Severity.CRITICAL if count > 200
        else Severity.HIGH if count > 100
        else Severity.MEDIUM if count > 30
        else Severity.LOW
    )
    endpoint = random.choice([
        "/api/users", "/api/orders", "/api/search",
        "/api/payments", "/api/auth", "/health",
    ])

    return EventPayload(
        id=f"evt-{uuid.uuid4().hex[:8]}",
        source=EventSource.ERROR_TRACKER,
        title=f"{error_type} on {service}{endpoint} ({count} occurrences)",
        severity=severity,
        timestamp=_random_ts(10),
        region=region,
        service=service,
        metadata={
            "error_type": error_type,
            "count": count,
            "endpoint": endpoint,
            "stack_trace_hash": uuid.uuid4().hex[:12],
        },
    )


# ---------------------------------------------------------------------------
# Batch generator
# ---------------------------------------------------------------------------

GENERATORS = [generate_infra_alert, generate_deploy_event, generate_app_error]


def generate_event_batch(batch_size: int = 15) -> list[EventPayload]:
    """Generate a mixed batch of events spanning all three sources."""
    return [random.choice(GENERATORS)() for _ in range(max(batch_size, 0))]
