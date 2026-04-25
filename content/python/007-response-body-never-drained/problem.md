---
slug: response-body-never-drained
track: python
orderIndex: 7
title: HTTP Response Body Never Read
difficulty: medium
tags:
  - resource-management
  - http
  - connection-pool
language: python
---

## Context

This client lives in `services/payment_gateway.py` and is used by the checkout service to authorise credit-card transactions. It uses the `requests` library and a module-level `Session` so that the underlying TCP connections are reused across calls.

Under moderate load (around 50 checkouts per minute) the service starts throwing `requests.exceptions.ConnectionError: HTTPSConnectionPool(...): Read timed out` after the server has been running for 10–15 minutes. Restarting the process clears it for another ~15 minutes. The payment gateway vendor confirms their API is healthy and that they are returning `200 OK` responses.

Adding logging shows the first call in each batch succeeds but subsequent calls stall. The team confirmed `max_retries` and `pool_maxsize` are both set to their defaults (they haven't been customised). Thread count in the process is normal.

## Buggy code

```python
import requests

_session = requests.Session()

def authorise(card_token: str, amount_cents: int) -> dict:
    resp = _session.post(
        "https://pay.example.com/v1/authorise",
        json={"token": card_token, "amount": amount_cents},
        timeout=5,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Gateway error: {resp.status_code}")
    # only read the body on success — skip parsing on non-200
    return resp.json()
```
