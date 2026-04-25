---
slug: read-modify-write-without-lock
track: python
orderIndex: 23
title: Read-Modify-Write Race on Shared Dict
difficulty: medium
tags:
  - concurrency
  - threading
  - race-condition
language: python
---

## Context

This module lives in `services/rate_limiter.py` and implements a simple in-process sliding-window rate limiter used by an API gateway. Multiple request handler threads call `record_request` and `is_allowed` concurrently to enforce per-client limits.

Under high load, the rate limiter occasionally allows significantly more requests than the configured `max_requests` limit — sometimes by a factor of 2x or more. The issue is intermittent and only appears when many threads are handling requests for the same client simultaneously. Individual unit tests all pass because they run single-threaded.

## Buggy code

```python
import time
from collections import defaultdict

class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._counts: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, client_id: str) -> bool:
        now = time.monotonic()
        window_start = now - self.window_seconds
        timestamps = self._counts[client_id]
        # Evict old entries
        self._counts[client_id] = [t for t in timestamps if t > window_start]
        if len(self._counts[client_id]) < self.max_requests:
            self._counts[client_id].append(now)
            return True
        return False
```
