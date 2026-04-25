---
slug: functools-lru-cache-unhashable-default
track: python
orderIndex: 70
title: lru_cache With List Default Argument
difficulty: medium
tags:
  - correctness
  - perf
  - api-misuse
language: python
---

## Context

This utility is in `analytics/aggregator.py`. It computes a weighted sum of metric values, caching results because the same `(metrics, weights)` pair is requested frequently from a dashboard endpoint. `weights` defaults to an equal-weight list when not supplied by the caller.

The service raises `TypeError: unhashable type: 'list'` on almost every request that omits the `weights` argument. The stack trace points to the `@lru_cache` decorator. Callers that pass an explicit tuple for `weights` work fine.

A developer tried changing the default from `[1, 1, 1]` to a tuple `(1, 1, 1)` but the function signature still lists it as a list in the docstring and the fix was reverted in review because it was considered 'inconsistent'. The error has persisted in production.

## Buggy code

```python
from functools import lru_cache
from typing import List, Optional

@lru_cache(maxsize=256)
def weighted_sum(
    metrics: tuple,
    weights: List[float] = [1.0, 1.0, 1.0],
) -> float:
    """
    Compute the dot product of metrics and weights.
    metrics must be a tuple of floats.
    weights defaults to equal weights for three metrics.
    """
    if len(metrics) != len(weights):
        raise ValueError("metrics and weights must have the same length")
    return sum(m * w for m, w in zip(metrics, weights))
```
