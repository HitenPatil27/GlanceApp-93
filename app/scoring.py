"""
Scoring / Ranking engine for GlanceApp 93.

Implements a weighted multi-factor model:
    score = w1*severity + w2*recency + w3*frequency + w4*blast_radius

Weights are adjustable at runtime via the feedback API.
"""

from __future__ import annotations

import math
import threading

from app.audit import AuditAction, audit_logger
from app.models import (
    EventPayload,
    ExplanationSource,
    FeedbackRequest,
    RankingWeights,
    ScoreBreakdown,
    ScoreFactors,
    ScoredEvent,
    Severity,
    to_utc,
    utc_now,
)
from app.store import store

# ---------------------------------------------------------------------------
# Tunable model constants
# ---------------------------------------------------------------------------

SEVERITY_SCORES: dict[Severity, float] = {
    Severity.CRITICAL: 1.0,
    Severity.HIGH: 0.75,
    Severity.MEDIUM: 0.5,
    Severity.LOW: 0.25,
}

RECENCY_LAMBDA = 0.05        # per-minute exponential decay constant
FREQUENCY_WINDOW_MIN = 5     # rolling burst-detection window
# Similar events that saturate the factor at 1.0. Kept low deliberately: at demo
# scale a 5-minute window rarely holds more than a handful of correlated alerts,
# and a saturation of 10 pinned the factor near 0.1 for every event, so it
# contributed almost nothing to the ranking. Five means "a real burst" here.
FREQUENCY_SATURATION = 5
BLAST_WINDOW_MIN = 15        # window for measuring incident spread
MAX_REGIONS = 5              # regions a single service can plausibly span
MAX_SERVICES = 10            # services a single region can plausibly host


class ScoringEngine:
    """Stateful scoring engine with adjustable weights."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._weights = RankingWeights()

    # ------------------------------------------------------------------
    # Weights
    # ------------------------------------------------------------------

    @property
    def weights(self) -> RankingWeights:
        with self._lock:
            return self._weights.model_copy()

    def update_weights(self, feedback: FeedbackRequest) -> RankingWeights:
        """Update weights from operator feedback. Normalises to sum=1.0."""
        raw = {
            "severity": max(feedback.severity, 0.0),
            "recency": max(feedback.recency, 0.0),
            "frequency": max(feedback.frequency, 0.0),
            "blast_radius": max(feedback.blast_radius, 0.0),
        }
        total = sum(raw.values())
        if total <= 0:
            # FeedbackRequest already rejects this, but keep the engine safe if
            # it is ever driven directly.
            return self.weights

        with self._lock:
            self._weights = RankingWeights(**{k: round(v / total, 4) for k, v in raw.items()})
            new_w = self._weights.model_copy()

        audit_logger.log(
            AuditAction.WEIGHTS_UPDATED,
            detail=f"New weights: sev={new_w.severity}, rec={new_w.recency}, "
                   f"freq={new_w.frequency}, blast={new_w.blast_radius}",
        )
        return new_w

    def reset_weights(self) -> RankingWeights:
        """Restore the documented default weight vector."""
        with self._lock:
            self._weights = RankingWeights()
            return self._weights.model_copy()

    # ------------------------------------------------------------------
    # Individual factor scores (all return 0.0 – 1.0)
    # ------------------------------------------------------------------

    @staticmethod
    def _severity_score(event: EventPayload) -> float:
        return SEVERITY_SCORES.get(event.severity, 0.5)

    @staticmethod
    def _age_minutes(event: EventPayload) -> float:
        """Age of the event in minutes, never negative (clocks can be skewed)."""
        delta = (utc_now() - to_utc(event.timestamp)).total_seconds() / 60
        return max(delta, 0.0)

    @classmethod
    def _recency_score(cls, age_minutes: float) -> float:
        return math.exp(-RECENCY_LAMBDA * age_minutes)

    @staticmethod
    def _frequency_score(similar_count: int) -> float:
        return min(similar_count / FREQUENCY_SATURATION, 1.0)

    @staticmethod
    def _blast_radius_score(services_in_region: int, regions_for_service: int) -> float:
        """Blend local cascade breadth with cross-region spread.

        Each dimension is normalised independently so neither can dominate, and
        a single isolated event correctly scores 0.0.
        """
        local = (services_in_region - 1) / max(MAX_SERVICES - 1, 1)
        spread = (regions_for_service - 1) / max(MAX_REGIONS - 1, 1)
        return min(0.5 * local + 0.5 * spread, 1.0)

    # ------------------------------------------------------------------
    # Full scoring
    # ------------------------------------------------------------------

    def score_event(self, event: EventPayload, quiet: bool = False) -> ScoredEvent:
        """Compute the composite score for a single event and persist it.

        Set ``quiet=True`` for bulk re-scoring so the audit trail gets one
        summary entry instead of one entry per event.
        """
        w = self.weights

        age_minutes = self._age_minutes(event)
        similar_count = store.count_similar_recent(event, window_minutes=FREQUENCY_WINDOW_MIN)
        services_in_region, regions_for_service = store.blast_footprint(
            event, window_minutes=BLAST_WINDOW_MIN
        )

        sev = self._severity_score(event)
        rec = self._recency_score(age_minutes)
        freq = self._frequency_score(similar_count)
        blast = self._blast_radius_score(services_in_region, regions_for_service)

        factors = ScoreFactors(
            severity=round(sev, 4),
            recency=round(rec, 4),
            frequency=round(freq, 4),
            blast_radius=round(blast, 4),
            age_minutes=round(age_minutes, 2),
            similar_events_in_window=similar_count,
            services_in_region=services_in_region,
            regions_for_service=regions_for_service,
        )

        breakdown = ScoreBreakdown(
            severity=round(sev * w.severity, 4),
            recency=round(rec * w.recency, 4),
            frequency=round(freq * w.frequency, 4),
            blast_radius=round(blast * w.blast_radius, 4),
        )

        total_score = round(
            breakdown.severity + breakdown.recency + breakdown.frequency + breakdown.blast_radius,
            4,
        )

        # Preserve any explanation already generated for this event so re-ranking
        # never blanks the operator's briefing text.
        previous = store.get_scored_event(event.id)

        scored = ScoredEvent(
            id=event.id,
            source=event.source,
            title=event.title,
            severity=event.severity,
            timestamp=event.timestamp,
            region=event.region,
            service=event.service,
            metadata=event.metadata,
            score=total_score,
            score_breakdown=breakdown,
            score_factors=factors,
            explanation=previous.explanation if previous else "",
            explanation_source=(
                previous.explanation_source if previous else ExplanationSource.PENDING
            ),
            rank=previous.rank if previous else 0,
        )

        store.upsert_scored_event(scored)

        if not quiet:
            audit_logger.log(
                AuditAction.SCORED,
                event_id=event.id,
                detail=f"score={total_score} | sev={breakdown.severity} rec={breakdown.recency} "
                       f"freq={breakdown.frequency} blast={breakdown.blast_radius} "
                       f"(age={factors.age_minutes}m, burst={similar_count}, "
                       f"svc/region={services_in_region}, regions/svc={regions_for_service})",
            )

        return scored

    def score_all(self) -> list[ScoredEvent]:
        """Re-score every raw event currently in the store (used after weight changes)."""
        events = store.get_all_raw_events()
        scored = [self.score_event(e, quiet=True) for e in events]
        scored.sort(key=lambda s: (s.score, s.timestamp), reverse=True)
        for idx, s in enumerate(scored):
            s.rank = idx + 1

        audit_logger.log(
            AuditAction.RESCORED,
            detail=f"Re-scored {len(scored)} events with current weights",
        )
        return scored


# Module-level singleton
scoring_engine = ScoringEngine()
