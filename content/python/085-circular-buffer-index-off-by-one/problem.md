---
slug: circular-buffer-index-off-by-one
track: python
orderIndex: 85
title: Circular Buffer Overwrites Unread Data
difficulty: hard
tags:
  - correctness
  - data-structures
  - concurrency
language: python
---

## Context

This class lives in `telemetry/ring_buffer.py` and implements a fixed-size circular buffer used to hold recent sensor readings in a real-time monitoring daemon. A producer thread pushes readings and a consumer thread periodically drains them. The buffer is intended to drop the oldest reading when full (overwrite semantics), not block.

Quality assurance found that the reported window of recent readings sometimes contains duplicate values instead of the most recent N readings. A staggered write/read stress test shows that the consumer occasionally reads the same slot twice in a row, and the last reading in a full buffer is sometimes overwritten before it is read.

The developer added a `size` property to track how many valid items are in the buffer, but stress testing shows it exceeds `capacity` briefly under concurrent load, which should be impossible.

## Buggy code

```python
import threading

class RingBuffer:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self._buf = [None] * capacity
        self._head = 0  # next write position
        self._tail = 0  # next read position
        self._count = 0
        self._lock = threading.Lock()

    def push(self, item) -> None:
        self._buf[self._head] = item
        self._head = (self._head + 1) % self.capacity
        if self._count < self.capacity:
            self._count += 1
        else:
            # overwrite: advance tail to discard oldest
            self._tail = (self._tail + 1) % self.capacity

    def pop(self) -> object:
        if self._count == 0:
            return None
        item = self._buf[self._tail]
        self._tail = (self._tail + 1) % self.capacity
        self._count -= 1
        return item

    @property
    def size(self) -> int:
        return self._count
```
