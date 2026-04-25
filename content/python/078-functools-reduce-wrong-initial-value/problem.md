---
slug: functools-reduce-wrong-initial-value
track: python
orderIndex: 78
title: reduce Initial Value Wrong Type
difficulty: medium
tags:
  - correctness
  - api-misuse
  - perf
language: python
---

## Context

This utility function lives in `analytics/aggregator.py` and is used to merge a list of per-shard count dictionaries into a single totals dictionary. Each shard produces a `dict[str, int]` mapping event names to occurrence counts. The merge function is called in a MapReduce-style pipeline that processes millions of events per hour.

The pipeline produces correct totals when there are two or more shards, but when exactly one shard is returned (which happens often for low-traffic time windows), the result is a raw dict rather than a merged dict — but downstream code that expects a `dict[str, int]` sometimes receives the single dict object directly, which compares equal to the correct result, masking the bug. The real failure surfaces when a shard list is empty: the function raises `TypeError: reduce() of empty iterable with no initial value`.

A teammate patched the empty-list case by adding `or [{}]`, but the single-element case still silently bypasses the merge path and returns the original dict object — which the caller then mutates, corrupting the shard's local state.

## Buggy code

```python
from functools import reduce
from typing import Counter

def merge_counts(shards: list[dict[str, int]]) -> dict[str, int]:
    """
    Merge a list of per-shard event count dicts into one combined dict.
    """
    def _merge(a: dict[str, int], b: dict[str, int]) -> dict[str, int]:
        result = dict(a)
        for key, val in b.items():
            result[key] = result.get(key, 0) + val
        return result

    return reduce(_merge, shards or [{}])
```
