"""
In-memory event store for GlanceApp 93.
Stores raw events, scored events, and provides lookup / query helpers.
Thread-safe via a single re-entrant lock for the hackathon scope.
"""

from __future__ import annotations

import threading
from collections import defaultdict, deque
from datetime import timedelta

from app.models import EventPayload, ExplanationSource, ScoredEvent, to_utc

# Cap the store so a long-running demo (or a runaway simulator) cannot grow
# memory without bound. Oldest events are evicted first.
MAX_EVENTS = 5_000


class EventStore:
    """Singleton-style in-memory store for events and scored results."""

    def __init__(self, max_events: int = MAX_EVENTS) -> None:
        # RLock so public methods can call each other without deadlocking.
        self._lock = threading.RLock()
        self._max_events = max_events
        self._raw_events: dict[str, EventPayload] = {}           # id -> event
        self._scored_events: dict[str, ScoredEvent] = {}         # id -> scored
        self._insertion_order: deque[str] = deque()              # ids, oldest first
        self._source_index: dict[str, list[str]] = defaultdict(list)  # source -> [ids]
        self._service_counts: dict[str, int] = defaultdict(int)  # service -> count
        self._region_counts: dict[str, int] = defaultdict(int)   # region  -> count

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def add_raw_event(self, event: EventPayload) -> None:
        with self._lock:
            replacing = event.id in self._raw_events
            if replacing:
                # Re-ingesting the same id: undo the previous event's index
                # contributions so counts stay accurate.
                self._deindex(self._raw_events[event.id])
            else:
                self._insertion_order.append(event.id)

            self._raw_events[event.id] = event
            self._source_index[event.source.value].append(event.id)
            if event.service:
                self._service_counts[event.service] += 1
            if event.region:
                self._region_counts[event.region] += 1

            self._evict_overflow()

    def upsert_scored_event(self, scored: ScoredEvent) -> None:
        with self._lock:
            self._scored_events[scored.id] = scored

    def set_explanation(
        self,
        event_id: str,
        explanation: str,
        source: ExplanationSource,
    ) -> bool:
        """Attach an explanation to a stored event. Returns False if it is gone."""
        with self._lock:
            scored = self._scored_events.get(event_id)
            if scored is None:
                return False
            scored.explanation = explanation
            scored.explanation_source = source
            return True

    # ------------------------------------------------------------------
    # Index maintenance
    # ------------------------------------------------------------------

    def _deindex(self, event: EventPayload) -> None:
        """Remove one event's contributions from the secondary indexes."""
        ids = self._source_index.get(event.source.value)
        if ids:
            try:
                ids.remove(event.id)
            except ValueError:
                pass
        if event.service and self._service_counts.get(event.service):
            self._service_counts[event.service] -= 1
            if self._service_counts[event.service] <= 0:
                del self._service_counts[event.service]
        if event.region and self._region_counts.get(event.region):
            self._region_counts[event.region] -= 1
            if self._region_counts[event.region] <= 0:
                del self._region_counts[event.region]

    def _evict_overflow(self) -> None:
        """Drop oldest events until we are back under the cap."""
        while len(self._insertion_order) > self._max_events:
            oldest_id = self._insertion_order.popleft()
            old_event = self._raw_events.pop(oldest_id, None)
            if old_event is not None:
                self._deindex(old_event)
            self._scored_events.pop(oldest_id, None)

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_raw_event(self, event_id: str) -> EventPayload | None:
        with self._lock:
            return self._raw_events.get(event_id)

    def get_scored_event(self, event_id: str) -> ScoredEvent | None:
        with self._lock:
            return self._scored_events.get(event_id)

    def get_all_raw_events(self) -> list[EventPayload]:
        with self._lock:
            return list(self._raw_events.values())

    def get_ranked_events(self, limit: int = 50, offset: int = 0) -> list[ScoredEvent]:
        """Return scored events sorted by score descending, with pagination.

        Ranks are assigned across the whole set (not just the page) so that
        `#1` always means "highest scoring event in the system".
        """
        with self._lock:
            sorted_events = sorted(
                self._scored_events.values(),
                # Tie-break on timestamp so equal scores get a stable, sensible order.
                key=lambda e: (e.score, e.timestamp),
                reverse=True,
            )
            for idx, ev in enumerate(sorted_events):
                ev.rank = idx + 1
            return sorted_events[offset: offset + limit]

    def total_scored(self) -> int:
        with self._lock:
            return len(self._scored_events)

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {
                "raw_events": len(self._raw_events),
                "scored_events": len(self._scored_events),
                "distinct_services": len(self._service_counts),
                "distinct_regions": len(self._region_counts),
                "capacity": self._max_events,
            }

    # ------------------------------------------------------------------
    # Frequency helpers (used by scoring engine)
    # ------------------------------------------------------------------

    def count_similar_recent(
        self,
        event: EventPayload,
        window_minutes: int = 5,
    ) -> int:
        """Count same-source, same-severity events clustered around this event.

        The window is anchored on the *event's own* timestamp rather than "now",
        so an alert burst that happened 20 minutes ago is still recognised as a
        burst. Recency is scored separately.
        """
        anchor = to_utc(event.timestamp)
        window = timedelta(minutes=window_minutes)
        count = 0
        with self._lock:
            for eid in self._source_index.get(event.source.value, []):
                other = self._raw_events.get(eid)
                if other is None or other.id == event.id:
                    continue
                if other.severity != event.severity:
                    continue
                if abs(to_utc(other.timestamp) - anchor) <= window:
                    count += 1
        return count

    def blast_footprint(
        self,
        event: EventPayload,
        window_minutes: int = 15,
    ) -> tuple[int, int]:
        """Measure how far this incident has spread.

        Returns ``(services_in_region, regions_for_service)``:

        * ``services_in_region`` — distinct services with events in the same
          region inside the window. Captures a local cascade.
        * ``regions_for_service`` — distinct regions with events for the same
          service inside the window. Captures cross-region spread.

        The previous implementation counted every service and region ever seen
        for the event's *source*, which saturated to 1.0 for every event and
        made the factor useless for ranking.
        """
        anchor = to_utc(event.timestamp)
        window = timedelta(minutes=window_minutes)

        services_in_region: set[str] = set()
        regions_for_service: set[str] = set()

        with self._lock:
            for other in self._raw_events.values():
                if abs(to_utc(other.timestamp) - anchor) > window:
                    continue
                if event.region and other.region == event.region and other.service:
                    services_in_region.add(other.service)
                if event.service and other.service == event.service and other.region:
                    regions_for_service.add(other.region)

        # An event always counts as impacting its own service/region.
        if event.service:
            services_in_region.add(event.service)
        if event.region:
            regions_for_service.add(event.region)

        return max(len(services_in_region), 1), max(len(regions_for_service), 1)

    # ------------------------------------------------------------------
    # Reset (demo replay / testing)
    # ------------------------------------------------------------------

    def clear(self) -> None:
        with self._lock:
            self._raw_events.clear()
            self._scored_events.clear()
            self._insertion_order.clear()
            self._source_index.clear()
            self._service_counts.clear()
            self._region_counts.clear()


# Module-level singleton
store = EventStore()
