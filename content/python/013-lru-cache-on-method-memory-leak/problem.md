---
slug: lru-cache-on-method-memory-leak
track: python
orderIndex: 13
title: lru_cache on Method Leaks Instances
difficulty: hard
tags:
  - resource-management
  - perf
  - caching
language: python
---

## Context

This class lives in `search/index.py`. Each `SearchIndex` instance is created per-tenant in a multi-tenant SaaS application, loads a large inverted index from disk, and is destroyed at the end of a request or background job. The `lookup` method is called many times per request with repeated query terms, so a developer added `@lru_cache` to avoid redundant computation.

Ops reported that the worker process memory never decreases between requests, growing steadily until the process is OOM-killed after handling a few thousand requests. Heap profiles show that `SearchIndex` objects and their large `_index` dicts are never garbage collected even after all Python references to the instance have supposedly been dropped.

The developer already verified that there are no global registries or lists holding references to old instances. The leak is subtler.

## Buggy code

```python
import json
from functools import lru_cache

class SearchIndex:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        # Simulates loading a large structure from disk
        self._index: dict[str, list[int]] = self._load(tenant_id)

    def _load(self, tenant_id: str) -> dict[str, list[int]]:
        # In production this reads a large file; simplified here
        return {"example": [1, 2, 3]}

    @lru_cache(maxsize=256)
    def lookup(self, query: str) -> list[int]:
        tokens = query.lower().split()
        results = set()
        for token in tokens:
            results.update(self._index.get(token, []))
        return sorted(results)
```
