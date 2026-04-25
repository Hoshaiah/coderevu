---
slug: generator-send-before-prime
track: python
orderIndex: 80
title: Generator Coroutine Used Before Priming
difficulty: hard
tags:
  - correctness
  - generators
  - api-misuse
language: python
---

## Context

This module lives in `pipeline/transforms.py` and implements a generator-based streaming aggregator used inside a data pipeline. The `running_average` generator is designed to receive numeric values via `.send()` and yield a running average after each one. It's wired into a pipeline runner that feeds sensor readings in real time.

Every time the pipeline starts up, the very first sensor reading causes `TypeError: can't send non-None value to a just-started generator`. Developers added a `try/except` workaround at the call site that silently discards the first value, but that means the first reading is always dropped from the average, subtly biasing all downstream analytics.

## Buggy code

```python
from typing import Generator

def running_average() -> Generator[float, float, None]:
    """
    Coroutine generator. Send numeric values; receive running average.
    Usage:
        gen = running_average()
        avg = gen.send(3.5)   # should yield 3.5
    """
    total = 0.0
    count = 0
    value = yield  # wait for first send
    while True:
        total += value
        count += 1
        value = yield total / count


def run_pipeline(readings: list[float]) -> list[float]:
    gen = running_average()
    results = []
    for reading in readings:
        avg = gen.send(reading)
        results.append(avg)
    return results
```
