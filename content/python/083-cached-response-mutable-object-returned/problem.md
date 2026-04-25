---
slug: cached-response-mutable-object-returned
track: python
orderIndex: 83
title: Cache Returns Mutable Reference Directly
difficulty: hard
tags:
  - correctness
  - concurrency
  - caching
language: python
---

## Context

`services/config_service.py` caches remote configuration fetched from a config server. The cache is a simple dict keyed by config name; values are parsed JSON objects (Python dicts). The cache is populated lazily on first access and refreshed every 60 seconds by a background thread. Many parts of the application call `get_config` concurrently.

Engineers noticed that config values sometimes arrive mutated at unexpected points in the code — for example, a feature-flag dict loses keys, or a list of allowed IPs gains extra entries. The mutations are not intentional; no code path is supposed to modify the config objects. Restarting the service clears the corruption temporarily.

The team added logging at every explicit write to the config but found none. The mutations appear spontaneously. They suspect a concurrency issue but have not found any obvious lock violations.

## Buggy code

```python
import copy
import threading
import time
from typing import Any

_cache: dict[str, Any] = {}
_lock = threading.Lock()
_TTL = 60  # seconds

def _fetch_from_server(name: str) -> Any:
    """Simulate remote config fetch; returns a fresh dict."""
    # In production this calls an HTTP endpoint
    return {"feature_flags": {"new_ui": True}, "allowed_ips": ["10.0.0.1"]}

def get_config(name: str) -> Any:
    with _lock:
        if name not in _cache:
            _cache[name] = _fetch_from_server(name)
        return _cache[name]  # returns the cached object directly

def refresh_loop() -> None:
    while True:
        time.sleep(_TTL)
        with _lock:
            for name in list(_cache):
                _cache[name] = _fetch_from_server(name)

def start_refresh_thread() -> None:
    t = threading.Thread(target=refresh_loop, daemon=True)
    t.start()
```
