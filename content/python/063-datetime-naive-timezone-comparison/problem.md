---
slug: datetime-naive-timezone-comparison
track: python
orderIndex: 63
title: >-
  Mixing naive and timezone-aware datetimes causes incorrect scheduling
  decisions
difficulty: medium
tags:
  - correctness
  - datetime
  - timezone
language: python
---

## Context

This function decides whether a scheduled maintenance window is currently active. It's used by a deployment gate that blocks releases during maintenance. The service runs on UTC servers but some maintenance windows were entered by operators in their local timezone and stored as ISO 8601 strings with an offset.

Deployments are occasionally blocked hours after a maintenance window ends, or allowed through during an active window — the gating logic seems to randomly produce wrong answers.

## Buggy code

```python
from datetime import datetime

def is_in_maintenance_window(start_iso: str, end_iso: str) -> bool:
    """
    start_iso and end_iso may be timezone-aware ISO strings like
    '2024-03-15T22:00:00+05:30' or naive strings like '2024-03-15T22:00:00'.
    """
    start = datetime.fromisoformat(start_iso)
    end = datetime.fromisoformat(end_iso)
    now = datetime.utcnow()  # naive UTC
    return start <= now <= end
```
