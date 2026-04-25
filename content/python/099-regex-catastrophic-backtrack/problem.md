---
slug: regex-catastrophic-backtrack
track: python
orderIndex: 99
title: >-
  Nested quantifiers in validation regex cause exponential backtracking on
  crafted input
difficulty: hard
tags:
  - performance
  - security
  - regex
  - denial-of-service
language: python
---

## Context

This input validation function is called on every incoming webhook payload to check that a `reference_code` field matches the expected format. The format is alphanumeric tokens separated by hyphens, e.g. `ABC-123-XYZ`.

The security team observed that sending a carefully crafted `reference_code` value causes the validation worker to spike to 100% CPU and stop responding for tens of seconds — a classic ReDoS pattern.

## Buggy code

```python
import re

REFERENCE_CODE_RE = re.compile(r"^([a-zA-Z0-9]+[-]?)+$")

def validate_reference_code(code: str) -> bool:
    """Return True if code matches the expected reference format."""
    if len(code) > 64:
        return False
    return bool(REFERENCE_CODE_RE.match(code))


# Example that triggers catastrophic backtracking:
# validate_reference_code("AAAAAAAAAAAAAAAAAAAAAAAAA!")
```
