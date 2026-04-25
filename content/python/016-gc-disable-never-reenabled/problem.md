---
slug: gc-disable-never-reenabled
track: python
orderIndex: 16
title: Garbage Collector Disabled Permanently
difficulty: hard
tags:
  - resource-management
  - perf
  - python-builtins
language: python
---

## Context

`serializers/fast_json.py` was optimized by a performance-conscious engineer who noted that Python's cyclic garbage collector adds overhead during large serialization loops. The engineer added `gc.disable()` before the loop and `gc.enable()` after, copying a pattern from a well-known performance blog. The function is called by a REST API handler that serializes large query result sets.

After several weeks in production, the service's memory usage grows without bound over the course of each day. The leak is slow (~5 MB/hour) and doesn't appear in short load tests. Restarting the service resets memory. Application-level object counts look normal; the leak appears to be in lower-level Python object cycles.

A profiler confirmed there are no obvious application-level memory leaks. The team hasn't connected the serialization optimization to the memory growth because the timing is gradual.

## Buggy code

```python
import gc
import json
from typing import Any

def serialize_records(records: list[dict[str, Any]]) -> str:
    # Disable GC during tight loop for performance
    gc.disable()
    try:
        parts = []
        for record in records:
            parts.append(json.dumps(record))
        result = "[" + ",".join(parts) + "]"
    except Exception:
        gc.enable()
        raise
    gc.enable()
    return result
```
