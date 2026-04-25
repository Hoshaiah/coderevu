---
slug: unbounded-cache-memory-leak
track: python
orderIndex: 6
title: In-memory request cache grows without bound and eventually OOMs the process
difficulty: medium
tags:
  - resource-management
  - performance
  - memory
language: python
---

## Context

This HTTP client wrapper caches responses to reduce load on a third-party rate-limited API. It's embedded in a long-running data pipeline that processes unique URLs over many hours. SRE has filed a ticket because the pipeline process RSS keeps climbing until it gets OOM-killed by the kernel, typically after 6–8 hours.

## Buggy code

```python
import urllib.request
import json
import hashlib

_cache: dict[str, dict] = {}

def fetch_json(url: str, headers: dict[str, str] | None = None) -> dict:
    cache_key = hashlib.sha256(url.encode()).hexdigest()
    if cache_key in _cache:
        return _cache[cache_key]

    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    _cache[cache_key] = data
    return data
```
