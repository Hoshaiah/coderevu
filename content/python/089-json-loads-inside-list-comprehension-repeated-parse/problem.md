---
slug: json-loads-inside-list-comprehension-repeated-parse
track: python
orderIndex: 89
title: Redundant JSON Decode in Hot Loop
difficulty: easy
tags:
  - perf
  - json
  - hot-loop
language: python
---

## Context

This function lives in `workers/event_processor.py` and processes batches of raw event payloads received from a Kafka consumer. Each `raw` payload is a JSON-encoded bytes object. The function filters events by type and then extracts a user ID from each matching event.

A profiler trace shows that `json.loads` is the top CPU consumer, accounting for roughly 60% of total processing time. Developers are surprised because the batch sizes are modest (a few hundred events), and they expected JSON parsing to be cheap. The function was written quickly and hasn't been reviewed since initial rollout.

## Buggy code

```python
import json

def extract_user_ids(raw_events: list[bytes], target_type: str) -> list[str]:
    """
    Filter events by `target_type` and return the `user_id` field.
    """
    matching = [
        json.loads(raw)
        for raw in raw_events
        if json.loads(raw).get("type") == target_type
    ]
    return [event["user_id"] for event in matching]
```
