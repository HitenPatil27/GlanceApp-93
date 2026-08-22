"""
Audit trail logger for GlanceApp 93.
Records every processing step: ingested → scored → explained → served.
Stored in-memory, queryable via API.
"""

from __future__ import annotations

import threading
from collections import deque
from typing import Optional

from app.models import AuditAction, AuditEntry

DEFAULT_MAX_ENTRIES = 5_000


class AuditLogger:
    """Append-only in-memory audit log with a bounded ring buffer."""

    def __init__(self, max_entries: int = DEFAULT_MAX_ENTRIES) -> None:
        self._lock = threading.RLock()
        # deque(maxlen=...) evicts the oldest entry in O(1) instead of
        # re-slicing the whole list on every append past the cap.
        self._entries: deque[AuditEntry] = deque(maxlen=max_entries)
        self._max_entries = max_entries

    def log(
        self,
        action: AuditAction,
        event_id: Optional[str] = None,
        detail: str = "",
    ) -> AuditEntry:
        entry = AuditEntry(action=action, event_id=event_id, detail=detail)
        with self._lock:
            self._entries.append(entry)
        return entry

    def get_entries(
        self,
        limit: int = 100,
        event_id: Optional[str] = None,
        action: Optional[AuditAction] = None,
    ) -> list[AuditEntry]:
        """Return audit entries, newest first, optionally filtered."""
        with self._lock:
            entries = list(self._entries)

        results: list[AuditEntry] = []
        # Walk newest-first and stop as soon as we have `limit` matches so a
        # 5,000-entry log stays cheap to query.
        for entry in reversed(entries):
            if event_id and entry.event_id != event_id:
                continue
            if action and entry.action != action:
                continue
            results.append(entry)
            if len(results) >= limit:
                break
        return results

    def count(self) -> int:
        with self._lock:
            return len(self._entries)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


# Module-level singleton
audit_logger = AuditLogger()
