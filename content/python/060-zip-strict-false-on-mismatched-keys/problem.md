---
slug: zip-strict-false-on-mismatched-keys
track: python
orderIndex: 60
title: Silent Mismatch in Column Mapping
difficulty: easy
tags:
  - correctness
  - data-processing
  - etl
language: python
---

## Context

This ETL helper lives in `pipelines/transform.py` and converts rows from a flat list format (returned by a legacy database driver) into dictionaries, using a header list fetched separately from a schema registry. It feeds downstream analytics aggregations that group by user ID and region.

The analytics team reports occasional grouping anomalies: some rows land in the wrong region bucket, and user IDs appear to shift by one position for certain record types. The bug does not reproduce consistently — it only manifests when the schema registry returns a different number of columns than the rows contain.

## Buggy code

```python
from typing import Any

def rows_to_dicts(
    headers: list[str],
    rows: list[list[Any]],
) -> list[dict[str, Any]]:
    result = []
    for row in rows:
        record = dict(zip(headers, row))
        result.append(record)
    return result
```
