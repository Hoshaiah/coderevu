---
slug: threading-timer-leaks-on-reschedule
track: python
orderIndex: 11
title: Repeated Timer Leak on Reschedule
difficulty: medium
tags:
  - resource-management
  - concurrency
  - threading
language: python
---

## Context

This module lives in `monitoring/heartbeat.py` and sends periodic heartbeat pings to a service-discovery endpoint. It uses `threading.Timer` for scheduling and re-arms itself on each successful ping. The heartbeat is started once at application startup and is expected to run for the lifetime of the process.

Ops notices that thread count (visible in `/proc/<pid>/status` and via `threading.active_count()`) climbs steadily over hours and eventually triggers an OS limit, causing new request threads to fail to spawn. The heartbeat itself keeps firing normally — the symptom is purely the growing thread count. Restarting the process resets the count to normal.

## Buggy code

```python
import threading
import urllib.request

HEARTBEAT_URL = "http://discovery.internal/heartbeat"
INTERVAL = 30.0

_timer: threading.Timer | None = None

def _ping() -> None:
    try:
        urllib.request.urlopen(HEARTBEAT_URL, timeout=5)
    except Exception:
        pass
    _schedule()

def _schedule() -> None:
    global _timer
    _timer = threading.Timer(INTERVAL, _ping)
    _timer.daemon = True
    _timer.start()

def start_heartbeat() -> None:
    _schedule()

def stop_heartbeat() -> None:
    global _timer
    if _timer is not None:
        _timer.cancel()
        _timer = None
```
