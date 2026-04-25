---
slug: defaultdict-shared-across-threads
track: python
orderIndex: 26
title: Shared defaultdict Mutated Concurrently
difficulty: medium
tags:
  - concurrency
  - thread-safety
  - correctness
language: python
---

## Context

`analytics/aggregator.py` runs inside a Flask application that handles high-throughput event ingestion. A `ThreadPoolExecutor` with 16 workers processes incoming batches, each calling `record_event` to accumulate per-user event counts into a module-level `defaultdict`. A background thread flushes the counts to PostgreSQL every 30 seconds and resets the dict.

The service intermittently logs `RuntimeError: dictionary changed size during iteration` during flush, and occasionally event counts are lower than expected — some increments are silently lost. The problem does not reproduce with a single worker thread.

The team ruled out the database layer (they checked with direct SQL) and confirmed the loss happens before the flush. A profiler showed no obvious hotspot; the bug is in the concurrent access pattern itself.

## Buggy code

```python
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import threading

# Module-level shared state
event_counts: defaultdict[str, int] = defaultdict(int)

def record_event(user_id: str, event_type: str) -> None:
    key = f"{user_id}:{event_type}"
    event_counts[key] += 1

def flush_counts() -> dict[str, int]:
    """Return a snapshot and reset the counts."""
    snapshot = dict(event_counts)
    event_counts.clear()
    return snapshot

def start_workers(events: list[tuple[str, str]]) -> None:
    with ThreadPoolExecutor(max_workers=16) as pool:
        for user_id, event_type in events:
            pool.submit(record_event, user_id, event_type)
```
