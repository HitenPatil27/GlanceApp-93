"""
Stream sender for GlanceApp 93.

Sends batches of simulated events to the ingest API endpoint at regular
intervals — the "3 simulated JSON event streams over HTTP" the PRD asks for.

Run it with the server up:
    python -m simulator.stream_sender
    python -m simulator.stream_sender --rounds 5 --batch-size 20 --interval 3
"""

from __future__ import annotations

import argparse
import sys
import time

import httpx

from simulator.event_generator import generate_event_batch

DEFAULT_URL = "http://localhost:8000/api/events/ingest"


def send_batch(api_url: str, batch_size: int, verbose: bool = True, timeout: float = 15.0) -> dict:
    """Generate and POST a batch of events to the ingest endpoint."""
    events = generate_event_batch(batch_size)

    # model_dump(mode="json") serialises datetimes and enums properly instead of
    # hand-rolling the dict (the old version silently diverged from the schema
    # every time a field was added to EventPayload).
    payload = {"events": [e.model_dump(mode="json") for e in events]}

    if verbose:
        print(f"\n[>>] Sending batch of {len(events)} events to {api_url}")
        for ev in events:
            print(f"   - [{ev.severity.value:>8}] [{ev.source.value:>16}] {ev.title[:70]}")

    resp = httpx.post(api_url, json=payload, timeout=timeout)
    resp.raise_for_status()
    result = resp.json()

    if verbose:
        print(f"[OK] Server response: {result.get('message', result)}")
        for err in result.get("errors") or []:
            print(f"[WARN] Server rejected {err.get('id')}: {err.get('error')}")

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="GlanceApp 93 — Event Stream Sender")
    parser.add_argument("--url", default=DEFAULT_URL, help="Ingest API URL")
    parser.add_argument("--batch-size", type=int, default=15, help="Events per batch")
    parser.add_argument("--rounds", type=int, default=3, help="Number of batches to send")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between batches")
    args = parser.parse_args()

    if args.batch_size < 1 or args.rounds < 1:
        parser.error("--batch-size and --rounds must both be at least 1")

    print("=" * 60)
    print("  GlanceApp 93 -- Event Stream Simulator")
    print(f"  Target: {args.url}")
    print(f"  Batch size: {args.batch_size} | Rounds: {args.rounds} | Interval: {args.interval}s")
    print("=" * 60)

    total_sent = 0
    failed_rounds = 0

    for i in range(args.rounds):
        print(f"\n--- Round {i + 1}/{args.rounds} ---")
        try:
            result = send_batch(args.url, args.batch_size)
            total_sent += int(result.get("ingested", args.batch_size))
        except httpx.HTTPStatusError as exc:
            failed_rounds += 1
            print(f"[ERROR] Server returned {exc.response.status_code}: {exc.response.text[:300]}")
        except httpx.HTTPError as exc:
            # Covers connect errors, timeouts and transport failures — the old
            # code only caught HTTPError but crashed on a malformed JSON body.
            failed_rounds += 1
            print(f"[ERROR] Could not reach {args.url}: {exc}")
        except ValueError as exc:
            failed_rounds += 1
            print(f"[ERROR] Server sent a non-JSON response: {exc}")

        if i < args.rounds - 1:
            print(f"[...] Waiting {args.interval}s before next batch...")
            time.sleep(args.interval)

    base = args.url.replace("/api/events/ingest", "")
    print(f"\n{'=' * 60}")
    print(f"  Done! Ingested {total_sent} events across {args.rounds} rounds "
          f"({failed_rounds} round(s) failed).")
    print(f"  View briefings: {base}/api/briefings")
    print(f"  View audit log: {base}/api/audit")
    print(f"{'=' * 60}")

    # Non-zero exit when nothing landed, so CI / demo scripts notice.
    if failed_rounds == args.rounds:
        print("[FATAL] Every round failed — is the API running?")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
