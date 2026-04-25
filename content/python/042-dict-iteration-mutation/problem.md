---
slug: dict-iteration-mutation
track: python
orderIndex: 42
title: Dict Modified During Iteration
difficulty: easy
tags:
  - correctness
  - runtime-error
  - dicts
language: python
---

## Context

This function lives in `cache/eviction.py` in a background worker that periodically sweeps an in-memory TTL cache, removing entries whose expiry timestamp has passed. The cache is a plain `dict` mapping string keys to `(value, expiry_epoch)` tuples. The worker calls this function every 30 seconds.

In production the worker process crashes intermittently with `RuntimeError: dictionary changed size during iteration`. The stack trace always points to the `for key, (_, expiry) in cache.items()` line. Restarting the worker temporarily fixes it, but it crashes again within minutes.

The developer believes the crash is caused by another thread modifying the cache concurrently and has been looking into locking, but the real issue is actually in this function itself.

## Buggy code

```python
import time

def evict_expired(cache: dict) -> int:
    """
    Remove all expired entries from the cache dict in-place.
    Returns the number of entries removed.
    """
    removed = 0
    now = time.time()
    for key, (_, expiry) in cache.items():
        if expiry < now:
            del cache[key]
            removed += 1
    return removed
```
