---
slug: deque-maxlen-overflow-silent
track: python
orderIndex: 76
title: Bounded Deque Drops Events Silently
difficulty: medium
tags:
  - correctness
  - concurrency
  - data-loss
language: python
---

## Context

`monitoring/event_buffer.py` implements an in-process event buffer for a metrics pipeline. Events are appended by multiple producer threads and drained by a single consumer thread. A `collections.deque` with `maxlen` was chosen to cap memory use: if the consumer falls behind, the oldest events are automatically dropped.

The on-call team notices that during traffic spikes the metrics dashboard shows gaps — events are missing for 30–60 second windows. The buffer was intended to smooth over brief consumer slowdowns, not drop events. The `maxlen` was set to 10,000 thinking that was large enough to never overflow.

Investigating the consumer log shows it processes events in batches by calling `list(buffer)` and then clearing the buffer with `buffer.clear()`. The producer rate during spikes is about 50,000 events/second, so overflow is plausible — but the engineers believe their two-step drain-then-clear is safe.

## Buggy code

```python
import threading
from collections import deque
from typing import Any

class EventBuffer:
    def __init__(self, maxlen: int = 10_000):
        self._buf: deque = deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def append(self, event: Any) -> None:
        with self._lock:
            self._buf.append(event)

    def drain(self) -> list[Any]:
        # Snapshot the buffer then clear it
        with self._lock:
            snapshot = list(self._buf)
        # Clear happens outside the lock
        self._buf.clear()
        return snapshot
```
