---
slug: shelve-dict-open-not-closed
track: python
orderIndex: 4
title: shelve Database Left Open
difficulty: easy
tags:
  - resource-management
  - file-io
  - correctness
language: python
---

## Context

This code lives in `cache/persistent_cache.py` and provides a simple persistent key-value store for caching API responses between runs of a CLI tool. The underlying store uses Python's `shelve` module backed by a `dbm` file on disk.

Users report that after the CLI tool crashes or is interrupted with Ctrl-C, subsequent runs sometimes see stale or missing cached values, and occasionally the process fails to open the shelf at all with a `dbm.error: db file doesn't exist` or file-lock error. The tool is only ever run by a single user on a single machine.

The team has verified that the values being written are correct immediately before the crash. The problem appears to be related to how the shelf is closed (or not closed) during abnormal exits.

## Buggy code

```python
import shelve
from typing import Any

CACHE_PATH = "/tmp/api_cache"

def get_cached(key: str) -> Any | None:
    db = shelve.open(CACHE_PATH)
    value = db.get(key)
    db.close()
    return value

def set_cached(key: str, value: Any) -> None:
    db = shelve.open(CACHE_PATH)
    db[key] = value
    db.close()

def invalidate(key: str) -> None:
    db = shelve.open(CACHE_PATH)
    if key in db:
        del db[key]
    db.close()
```
