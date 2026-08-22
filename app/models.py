"""
Pydantic models for GlanceApp 93 — Gen AI + Ranking module.
Defines schemas for events, scored results, briefings, feedback, and audit entries.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def to_utc(value: datetime) -> datetime:
    """Coerce any datetime to timezone-aware UTC.

    Clients frequently post ISO timestamps without an offset (e.g.
    "2026-08-22T10:00:00"). Pydantic parses those into *naive* datetimes, and
    subtracting a naive datetime from an aware one raises TypeError. Every
    timestamp entering the system is normalised here so the scoring engine can
    always assume UTC-aware values.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class EventSource(str, Enum):
    INFRA_MONITOR = "infra-monitor"
    DEPLOY_PIPELINE = "deploy-pipeline"
    ERROR_TRACKER = "error-tracker"


class ExplanationSource(str, Enum):
    """Where an event's briefing text came from — surfaced honestly in the UI."""

    PENDING = "pending"      # queued for generation, nothing available yet
    GENAI = "genai"          # produced by the LLM
    FALLBACK = "fallback"    # deterministic rule-based template


# ---------------------------------------------------------------------------
# Incoming Event
# ---------------------------------------------------------------------------

class EventPayload(BaseModel):
    """Raw event received from any of the three simulated streams."""

    id: str = Field(default_factory=lambda: f"evt-{uuid.uuid4().hex[:8]}", min_length=1, max_length=128)
    source: EventSource
    title: str = Field(..., min_length=1, max_length=500)
    severity: Severity = Severity.MEDIUM
    timestamp: datetime = Field(default_factory=utc_now)
    region: Optional[str] = Field(default=None, max_length=64)
    service: Optional[str] = Field(default=None, max_length=64)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("timestamp")
    @classmethod
    def _normalise_timestamp(cls, value: datetime) -> datetime:
        return to_utc(value)


class EventBatch(BaseModel):
    """Batch of events sent to the ingest endpoint."""

    events: list[EventPayload] = Field(..., min_length=1, max_length=1000)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

class ScoreBreakdown(BaseModel):
    """Weighted contribution of each factor. These four sum to `score`."""

    severity: float = 0.0
    recency: float = 0.0
    frequency: float = 0.0
    blast_radius: float = 0.0


class ScoreFactors(BaseModel):
    """Raw 0.0–1.0 factor values (before weighting) plus the observations behind them.

    Kept separate from ScoreBreakdown so the UI can draw honest 0–100% bars and
    show operators *why* a factor scored the way it did.
    """

    severity: float = 0.0
    recency: float = 0.0
    frequency: float = 0.0
    blast_radius: float = 0.0

    # Supporting evidence
    age_minutes: float = 0.0
    similar_events_in_window: int = 0
    services_in_region: int = 0
    regions_for_service: int = 0


class ScoredEvent(BaseModel):
    """An event enriched with its computed score, breakdown, and AI explanation."""

    id: str
    source: EventSource
    title: str
    severity: Severity
    timestamp: datetime
    region: Optional[str] = None
    service: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    score: float = 0.0
    score_breakdown: ScoreBreakdown = Field(default_factory=ScoreBreakdown)
    score_factors: ScoreFactors = Field(default_factory=ScoreFactors)
    explanation: str = ""
    explanation_source: ExplanationSource = ExplanationSource.PENDING
    rank: int = 0

    @field_validator("timestamp")
    @classmethod
    def _normalise_timestamp(cls, value: datetime) -> datetime:
        return to_utc(value)


# ---------------------------------------------------------------------------
# Briefing Response
# ---------------------------------------------------------------------------

class RankingWeights(BaseModel):
    severity: float = Field(default=0.35, ge=0.0, le=1.0)
    recency: float = Field(default=0.25, ge=0.0, le=1.0)
    frequency: float = Field(default=0.20, ge=0.0, le=1.0)
    blast_radius: float = Field(default=0.20, ge=0.0, le=1.0)


class BriefingResponse(BaseModel):
    briefings: list[ScoredEvent]
    total: int
    weights: RankingWeights
    generated_at: datetime = Field(default_factory=utc_now)


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    """Operator-submitted weight adjustments. Normalised server-side to sum to 1.0."""

    severity: float = Field(default=0.35, ge=0.0, le=100.0)
    recency: float = Field(default=0.25, ge=0.0, le=100.0)
    frequency: float = Field(default=0.20, ge=0.0, le=100.0)
    blast_radius: float = Field(default=0.20, ge=0.0, le=100.0)

    @model_validator(mode="after")
    def _reject_all_zero(self) -> "FeedbackRequest":
        if (self.severity + self.recency + self.frequency + self.blast_radius) <= 0:
            raise ValueError(
                "At least one ranking weight must be greater than zero — "
                "an all-zero weight vector cannot be normalised."
            )
        return self


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

class AuditAction(str, Enum):
    INGESTED = "ingested"
    SCORED = "scored"
    EXPLAINED = "explained"
    SERVED = "served"
    WEIGHTS_UPDATED = "weights_updated"
    RESCORED = "rescored"
    RESET = "reset"
    REJECTED = "rejected"


class AuditEntry(BaseModel):
    timestamp: datetime = Field(default_factory=utc_now)
    event_id: Optional[str] = None
    action: AuditAction
    detail: str = ""
