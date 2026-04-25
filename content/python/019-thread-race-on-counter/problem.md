---
slug: thread-race-on-counter
track: python
orderIndex: 19
title: Unsynchronised counter increments lose updates under concurrent load
difficulty: medium
tags:
  - concurrency
  - race-condition
  - threading
language: python
---

## Context

A background analytics service tracks how many events of each type have been processed. Workers run in a `ThreadPoolExecutor` and call `record_event` for every message they consume. At the end of each minute, the counters are flushed to a time-series database.

Ops noticed the flushed totals are consistently lower than the number of messages confirmed by the message broker — sometimes by thousands per minute under peak load.

## Buggy code

```python
import threading
from concurrent.futures import ThreadPoolExecutor

counters: dict[str, int] = {}

def record_event(event_type: str) -> None:
    if event_type not in counters:
        counters[event_type] = 0
    counters[event_type] += 1

def flush_counters() -> dict[str, int]:
    snapshot = dict(counters)
    counters.clear()
    return snapshot

def process_events(events: list[str]) -> None:
    with ThreadPoolExecutor(max_workers=8) as pool:
        pool.map(record_event, events)
```
