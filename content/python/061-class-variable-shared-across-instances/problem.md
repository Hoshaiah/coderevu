---
slug: class-variable-shared-across-instances
track: python
orderIndex: 61
title: Class Variable Shared Across Instances
difficulty: easy
tags:
  - correctness
  - oop
  - concurrency
language: python
---

## Context

This class lives in `messaging/batch_sender.py` and buffers outgoing messages before flushing them to a message broker. Multiple independent `BatchSender` instances are created per worker process — one per destination topic — and each is expected to maintain its own private buffer. The class was refactored from a module-level singleton to support multiple topics.

Operators report messages being delivered to the wrong topics: a message intended for `topic-A` occasionally appears on `topic-B` or `topic-C`. The bug is consistent and reproducible in integration tests that create two `BatchSender` instances. Inspecting individual send calls confirms the correct topic is passed at construction time.

## Buggy code

```python
import threading
from typing import Any

class BatchSender:
    _buffer: list[Any] = []
    _lock = threading.Lock()

    def __init__(self, topic: str, max_batch: int = 100) -> None:
        self.topic = topic
        self.max_batch = max_batch

    def send(self, message: Any) -> None:
        with self._lock:
            self._buffer.append(message)
            if len(self._buffer) >= self.max_batch:
                self._flush()

    def _flush(self) -> None:
        batch = self._buffer[:]
        self._buffer.clear()
        _publish(self.topic, batch)

def _publish(topic: str, batch: list) -> None:
    pass
```
