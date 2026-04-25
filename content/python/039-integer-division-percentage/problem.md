---
slug: integer-division-percentage
track: python
orderIndex: 39
title: Integer division truncates percentage calculation to zero for small counts
difficulty: easy
tags:
  - correctness
  - numeric
  - python-gotcha
language: python
---

## Context

This reporting function is part of an A/B testing dashboard. It takes experiment results and returns a summary dict including conversion rates. QA noticed that every experiment with fewer than 100 conversions shows a 0% conversion rate in the dashboard, even when the raw numbers clearly show conversions occurring.

## Buggy code

```python
def compute_experiment_summary(
    variant_name: str,
    impressions: int,
    conversions: int,
) -> dict:
    if impressions == 0:
        conversion_rate = 0
    else:
        conversion_rate = conversions / impressions * 100 // 1

    return {
        "variant": variant_name,
        "impressions": impressions,
        "conversions": conversions,
        "conversion_rate_pct": conversion_rate,
    }


# Example: 5 conversions out of 200 impressions -> should be 2.5%, returns 0
result = compute_experiment_summary("control", 200, 5)
```
