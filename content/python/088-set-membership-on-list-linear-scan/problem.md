---
slug: set-membership-on-list-linear-scan
track: python
orderIndex: 88
title: Linear Scan on Blocklist Lookup
difficulty: easy
tags:
  - perf
  - data-structures
  - api-misuse
language: python
---

## Context

This function lives in `app/middleware/rate_limit.py` and is called on every incoming HTTP request to check whether the requesting IP is on a blocklist. The blocklist is loaded once at startup from a Redis set and stored in a module-level variable. The service handles roughly 5,000 requests per second across 30 workers.

Ops has filed a ticket saying p99 latency jumped from ~4 ms to ~80 ms after a routine security patch that expanded the blocklist from 200 entries to 85,000 entries. CPU profiling shows the middleware itself consuming 35% of total request CPU, up from under 1%.

The engineering team ruled out network issues and Redis latency — the blocklist is loaded locally, not fetched per request. The symptom scales linearly with blocklist size, which pointed them toward this file.

## Buggy code

```python
import redis

_blocklist: list[str] = []

def load_blocklist(redis_url: str) -> None:
    global _blocklist
    client = redis.from_url(redis_url)
    _blocklist = client.smembers("ip_blocklist")
    _blocklist = [ip.decode() for ip in _blocklist]

def is_blocked(ip: str) -> bool:
    return ip in _blocklist
```
