---
slug: asyncio-gather-first-exception-drops-tasks
track: python
orderIndex: 29
title: asyncio.gather Cancels Sibling Tasks Silently
difficulty: medium
tags:
  - concurrency
  - asyncio
  - error-handling
language: python
---

## Context

This code lives in `services/notification_dispatcher.py` and fans out a batch of push notifications to multiple provider APIs (Firebase, APNS, email) concurrently using `asyncio.gather`. It's called from a background worker that processes queued notification jobs. Each provider call is independent — a failure on one channel should not prevent the others from completing.

Operators have noticed that when the Firebase API returns a 5xx error (which it does occasionally during quota events), email and APNS notifications for the same batch are also silently dropped. Metrics show the per-provider success counters all go to zero simultaneously, even though APNS and the email service return 200s fine when tested in isolation. The batch is then marked as failed and retried in full, causing duplicate deliveries on the retry.

The team added try/except blocks inside each individual provider function but the problem persists. They verified the individual provider coroutines handle their own exceptions — the issue is in how the dispatcher aggregates them.

## Buggy code

```python
import asyncio
from typing import Any

async def send_firebase(payload: dict) -> dict:
    # ... calls Firebase API ...
    await asyncio.sleep(0.1)  # simulate network
    return {"provider": "firebase", "status": "ok"}

async def send_apns(payload: dict) -> dict:
    await asyncio.sleep(0.1)
    return {"provider": "apns", "status": "ok"}

async def send_email(payload: dict) -> dict:
    await asyncio.sleep(0.1)
    return {"provider": "email", "status": "ok"}

async def dispatch_notifications(payload: dict) -> list[dict]:
    """
    Send notification via all channels concurrently.
    Returns results from all providers.
    """
    results = await asyncio.gather(
        send_firebase(payload),
        send_apns(payload),
        send_email(payload),
    )
    return list(results)

async def process_job(job: dict) -> None:
    results = await dispatch_notifications(job["payload"])
    successful = [r for r in results if r["status"] == "ok"]
    print(f"Sent via {len(successful)} channels")
```
