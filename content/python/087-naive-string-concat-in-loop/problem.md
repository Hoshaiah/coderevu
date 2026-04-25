---
slug: naive-string-concat-in-loop
track: python
orderIndex: 87
title: Quadratic String Concat in Loop
difficulty: easy
tags:
  - perf
  - strings
  - data-processing
language: python
---

## Context

This function lives in `exporters/json_lines.py` in a data pipeline that serialises a list of record dicts into a newline-delimited JSON string for bulk upload to an analytics warehouse. It is called once per batch, where a batch can contain anywhere from a few rows up to 500,000 rows.

For small batches the function is imperceptibly fast. For batches over ~50,000 rows, runtime grows dramatically — engineering has profiled it and found the function takes over 40 seconds for a 200,000-row batch on a standard server, while equivalent Go code finishes in under a second. Memory usage also spikes unexpectedly.

The function has not changed since it was written for a prototype; it was originally tested with batches of a few hundred rows and performed acceptably.

## Buggy code

```python
import json
from typing import Any

def to_jsonlines(records: list[dict[str, Any]]) -> str:
    """
    Serialise a list of dicts to newline-delimited JSON (NDJSON).
    """
    output = ""
    for record in records:
        output += json.dumps(record) + "\n"
    return output
```
