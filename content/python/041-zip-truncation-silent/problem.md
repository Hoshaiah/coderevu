---
slug: zip-truncation-silent
track: python
orderIndex: 41
title: zip() Silently Truncates Mismatched Lists
difficulty: easy
tags:
  - correctness
  - data-loss
  - builtins
language: python
---

## Context

This function lives in `reports/pairing.py` in an internal analytics service. It pairs up two lists — user IDs and their corresponding scores — that are fetched from separate queries and then passed here for serialisation into a report payload. The lists are expected to be the same length.

Product has complained that some weekly reports show fewer rows than expected. The database definitely returns the right number of records, and logging confirms both lists arrive at this function with their full contents. The truncation only manifests in the output dict.

A teammate already checked for off-by-one errors in the SQL queries and found nothing wrong. The bug is entirely inside this function.

## Buggy code

```python
def build_score_report(user_ids: list[int], scores: list[float]) -> list[dict]:
    """
    Pair each user ID with its score and return a list of record dicts.
    Both lists must be the same length.
    """
    records = []
    for uid, score in zip(user_ids, scores):
        records.append({"user_id": uid, "score": round(score, 2)})
    return records
```
