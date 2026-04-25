---
slug: lru-cache-on-heavy-default-arg
track: python
orderIndex: 97
title: LRU Cache Key Includes Mutable Default
difficulty: hard
tags:
  - perf
  - correctness
  - caching
language: python
---

## Context

This module lives in `search/query_builder.py` and constructs Elasticsearch query DSL dicts. The `build_query` function is called on every search request and has been decorated with `functools.lru_cache` to avoid redundant computation when the same parameters are repeated. The cache key includes all function arguments, including `filters`.

Engineers notice that cache hit rate is effectively zero even for identical-looking searches. Profiling shows `build_query` reconstructing the same query dict on every single call despite an LRU cache with size 512. Memory usage is also higher than expected. The function is only called from a single thread.

## Buggy code

```python
import functools
import json
from typing import Any

@functools.lru_cache(maxsize=512)
def build_query(
    term: str,
    filters: dict[str, Any],
    size: int = 10,
) -> dict[str, Any]:
    query: dict[str, Any] = {
        "query": {
            "bool": {
                "must": [{"match": {"_all": term}}],
                "filter": [
                    {"term": {k: v}} for k, v in filters.items()
                ],
            }
        },
        "size": size,
    }
    return query

def search(term: str, filters: dict[str, Any]) -> dict:
    q = build_query(term, filters)
    return _execute(q)

def _execute(query: dict) -> dict:
    return {}
```
