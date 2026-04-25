---
slug: heapq-max-heap-wrong-sign
track: python
orderIndex: 72
title: Max-Heap Built with Wrong Sign
difficulty: medium
tags:
  - correctness
  - algorithms
  - data-structures
language: python
---

## Context

`ranking/top_scores.py` is part of a leaderboard service. The function `top_k_scores` is used to efficiently return the top-K player scores from a potentially large stream without sorting the entire list. It was written by a developer who remembered that Python's `heapq` only provides a min-heap and tried to adapt it for a max-heap.

QA noticed that for some inputs the returned list is not actually the top-K scores — lower scores are sometimes included while higher ones are excluded. The function passes unit tests written with small, hand-picked inputs but fails on randomised test data. The business impact is that leaderboard rankings are occasionally wrong, showing players who didn't earn a top-K position.

The team confirmed that the input data is correct. The bug is in how the heap invariant is maintained, not in the data source.

## Buggy code

```python
import heapq
from typing import Sequence

def top_k_scores(
    scores: Sequence[tuple[str, int]],
    k: int,
) -> list[tuple[str, int]]:
    """
    Return the top-k (player, score) tuples from `scores`, highest first.
    Uses a min-heap of size k for O(n log k) performance.
    """
    # heap entries: (score, player) — negate score for max-heap simulation
    heap: list[tuple[int, str]] = []

    for player, score in scores:
        entry = (-score, player)
        if len(heap) < k:
            heapq.heappush(heap, entry)
        elif entry > heap[0]:
            heapq.heapreplace(heap, entry)

    # Convert back: negate score and sort descending
    result = [(player, -score) for score, player in heap]
    result.sort(key=lambda x: x[1], reverse=True)
    return result
```
