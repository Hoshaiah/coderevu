---
slug: sorted-key-lambda-closure
track: python
orderIndex: 46
title: Closure Captures Loop Variable in Sort
difficulty: easy
tags:
  - correctness
  - closures
  - sorting
language: python
---

## Context

This utility lives in `app/reporting/rankers.py` and is used by the weekly report generator to rank product categories by a configurable metric. It returns a list of category names sorted by whichever column was requested.

Ops noticed that regardless of which `metric` is passed in, the results always appear to be sorted by the last metric defined in `METRICS` rather than the one requested. The bug is reproducible in every environment but only affects callers that pass a non-default metric name.

## Buggy code

```python
METRICS = ["revenue", "units_sold", "margin"]

def rank_categories(rows: list[dict], metric: str) -> list[str]:
    """
    rows: list of dicts like {"name": "Electronics", "revenue": 5000, ...}
    metric: one of METRICS
    """
    sorters = []
    for m in METRICS:
        sorters.append(lambda row: row[m])

    if metric not in METRICS:
        raise ValueError(f"Unknown metric: {metric}")

    key_fn = sorters[METRICS.index(metric)]
    return [row["name"] for row in sorted(rows, key=key_fn, reverse=True)]
```
