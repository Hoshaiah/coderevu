---
slug: regex-compiled-in-loop-perf
track: python
orderIndex: 92
title: Regex Recompiled on Every Iteration
difficulty: easy
tags:
  - perf
  - regex
  - hot-path
language: python
---

## Context

This validator lives in `api/validators.py` and is called to check every field value in incoming JSON payloads before they are written to the database. The API receives roughly 2,000 requests per second at peak load, and each request body may contain 10–20 fields. The validator is a simple pattern-match against allowed formats per field type.

Performance profiling triggered by a latency regression revealed that `api/validators.py` accounts for 18% of total CPU time at peak — unexpectedly high for what should be trivial string matching. The profiler flamegraph shows a disproportionate amount of time inside `re.compile` and `sre_compile.compile` rather than in the actual match step. The code works correctly in terms of output.

The team has already confirmed the regexes themselves are not catastrophically backtracking (they're simple anchored patterns). The bottleneck is purely the repeated compilation.

## Buggy code

```python
import re
from typing import Any

FIELD_PATTERNS = {
    "email": r"^[\w.+-]+@[\w-]+\.[a-z]{2,}$",
    "phone": r"^\+?[1-9]\d{7,14}$",
    "username": r"^[a-zA-Z0-9_]{3,32}$",
    "zip_code": r"^[0-9]{5}(?:-[0-9]{4})?$",
    "url": r"^https?://[^\s/$.?#].[^\s]*$",
}

def validate_field(field_type: str, value: Any) -> bool:
    """
    Return True if the value matches the expected pattern for the field type.
    """
    if not isinstance(value, str):
        return False
    pattern = FIELD_PATTERNS.get(field_type)
    if pattern is None:
        return True  # unknown field types pass through
    return bool(re.compile(pattern).match(value))

def validate_payload(payload: dict) -> dict[str, bool]:
    return {
        field: validate_field(field, value)
        for field, value in payload.items()
    }
```
