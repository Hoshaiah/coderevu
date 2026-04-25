---
slug: cached-property-on-mutable-input
track: python
orderIndex: 69
title: Stale Cache After Mutable Argument Mutation
difficulty: medium
tags:
  - correctness
  - caching
  - mutable-state
language: python
---

## Context

This class lives in `analytics/segment_stats.py` and wraps a list of numeric samples to compute descriptive statistics on demand. It uses `functools.lru_cache` on its methods to avoid recomputing expensive statistics when called multiple times with the same data. The class is used by a dashboard endpoint that progressively adds new samples while the user is watching.

The dashboard team reports that statistics shown on screen stop updating after the first computation. New samples are confirmed to be appended (the raw list grows), but the cached statistics never change. Disabling the cache entirely "fixes" the issue, which pointed developers to this file.

## Buggy code

```python
import functools
import statistics

class SegmentStats:
    def __init__(self, samples: list[float]):
        # Store a reference to the caller's list so new samples are visible
        self.samples = samples

    @functools.lru_cache(maxsize=None)
    def mean(self) -> float:
        return statistics.mean(self.samples)

    @functools.lru_cache(maxsize=None)
    def stdev(self) -> float:
        return statistics.stdev(self.samples)

    @functools.lru_cache(maxsize=None)
    def median(self) -> float:
        return statistics.median(self.samples)
```
