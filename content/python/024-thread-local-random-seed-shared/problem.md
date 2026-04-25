---
slug: thread-local-random-seed-shared
track: python
orderIndex: 24
title: Shared Random Instance Across Threads
difficulty: medium
tags:
  - concurrency
  - correctness
  - threading
language: python
---

## Context

This module lives in `simulation/monte_carlo.py` and provides a helper used by a Flask-based simulation API. Each HTTP request triggers one or more calls to `sample_outcomes()` from a thread-pool worker. The module initialises a single `random.Random` instance at import time for efficiency, expecting to avoid the overhead of creating new instances per call.

Statisticians using the API have filed a bug: when they send 50 concurrent requests with the same seed, the returned distributions vary unpredictably between runs. They expected deterministic output given a fixed seed but are seeing different histograms each time.

The team verified there are no network-level differences. Logging individual samples showed that values from different threads appear to be interleaved in unexpected ways, as though the internal state of the RNG is being clobbered mid-sequence.

## Buggy code

```python
import random
import threading
from typing import List

# Shared RNG — created once at import time
_rng = random.Random()

_lock = threading.Lock()

def sample_outcomes(seed: int, n: int) -> List[float]:
    """
    Generate n uniform samples reproducibly for a given seed.
    """
    _rng.seed(seed)
    results = []
    for _ in range(n):
        results.append(_rng.uniform(0.0, 1.0))
    return results
```
