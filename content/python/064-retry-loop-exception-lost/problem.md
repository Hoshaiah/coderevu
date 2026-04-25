---
slug: retry-loop-exception-lost
track: python
orderIndex: 64
title: Original Exception Lost in Retry Loop
difficulty: medium
tags:
  - correctness
  - error-handling
  - exceptions
language: python
---

## Context

This helper lives in `infra/http_client.py` and wraps `requests` with a simple retry loop for transient failures. It is used by several microservices to call external payment and shipping APIs. When retries are exhausted, it is supposed to raise the last exception so callers can log the root cause.

Engineers have noticed that exception reports in Sentry always show `RuntimeError: all 3 retries exhausted` with no chained cause, making it impossible to tell whether the underlying error was a timeout, a `ConnectionError`, or a non-2xx response. The original exception and its traceback are gone.

The developer who wrote this thought raising a new `RuntimeError` after the loop would be informative, not realising it destroys the original context.

## Buggy code

```python
import time
import requests

def get_with_retry(url: str, retries: int = 3, backoff: float = 0.5) -> requests.Response:
    last_exc = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=5)
            resp.raise_for_status()
            return resp
        except (requests.RequestException, IOError) as exc:
            last_exc = exc
            time.sleep(backoff * (2 ** attempt))
    raise RuntimeError(f"all {retries} retries exhausted")
```
