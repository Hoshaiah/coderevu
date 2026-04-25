---
slug: string-format-in-logging-call
track: python
orderIndex: 90
title: Eager String Format in Log Call
difficulty: easy
tags:
  - perf
  - logging
  - string-formatting
language: python
---

## Context

This middleware lives in `middleware/request_logger.py` and logs every incoming HTTP request along with the full request body for debug tracing. In production, the log level is set to `WARNING`, so debug messages are not emitted. The middleware was added during a debugging session and was never intended to stay in the codebase long-term — but it did.

A performance review flagged this middleware as responsible for a measurable increase in p99 latency on high-traffic endpoints. Profiling shows significant time spent in string formatting and JSON serialization on every request, even though no log output is produced. The log level in production has not been changed from `WARNING`.

## Buggy code

```python
import json
import logging

logger = logging.getLogger(__name__)

def log_request(method: str, path: str, body: bytes) -> None:
    """
    Log request details at DEBUG level for tracing.
    Called on every inbound HTTP request.
    """
    decoded = body.decode("utf-8", errors="replace")
    try:
        pretty = json.dumps(json.loads(decoded), indent=2)
    except (ValueError, TypeError):
        pretty = decoded

    logger.debug(
        "Incoming request: %s %s\nBody:\n%s" % (method, path, pretty)
    )
    logger.debug(
        "Request size: %d bytes" % len(body)
    )
```
