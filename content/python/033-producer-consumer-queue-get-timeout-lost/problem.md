---
slug: producer-consumer-queue-get-timeout-lost
track: python
orderIndex: 33
title: Queue Timeout Swallows Shutdown Signal
difficulty: medium
tags:
  - concurrency
  - correctness
  - threading
language: python
---

## Context

This worker lives in `workers/event_processor.py` and processes events from a shared queue. A `threading.Event` named `_stop` is set by the main thread to signal graceful shutdown. The worker is expected to drain remaining items and then exit cleanly within a few seconds of shutdown being requested.

During deployment rollouts, the worker process sometimes hangs for the full timeout window (up to 30 seconds) before exiting, delaying container shutdown and triggering SIGKILL from the orchestrator. The `_stop` event is definitely being set — adding a log line inside `if _stop.is_set()` confirms it fires. Yet the worker blocks well past that point.

## Buggy code

```python
import queue
import threading
from typing import Any

_stop = threading.Event()
_q: queue.Queue = queue.Queue()

def worker() -> None:
    while not _stop.is_set():
        try:
            item = _q.get(timeout=30)
        except queue.Empty:
            continue
        try:
            _handle(item)
        finally:
            _q.task_done()

def _handle(item: Any) -> None:
    pass

def shutdown() -> None:
    _stop.set()
```
