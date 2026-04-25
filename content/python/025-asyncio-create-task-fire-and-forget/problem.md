---
slug: asyncio-create-task-fire-and-forget
track: python
orderIndex: 25
title: Fire-and-Forget Task Silently Drops Exceptions
difficulty: medium
tags:
  - concurrency
  - correctness
  - asyncio
language: python
---

## Context

This code is in `workers/notification_sender.py`. After persisting an order, the HTTP handler schedules a notification task using `asyncio.create_task()` so the response is returned to the client immediately without waiting for the notification to be sent.

Ops noticed that notification delivery rates dropped to near zero after a recent deploy, but no errors appear in the application logs. The orders themselves are being persisted correctly. Metrics show `create_task()` is being called, but the downstream notification service is receiving no traffic.

When a developer manually `await`-ed the coroutine in a test, a `ConnectionRefusedError` was raised immediately — the notification service URL had changed. In production the fire-and-forget pattern suppressed that error entirely.

## Buggy code

```python
import asyncio
import httpx

async def _send_notification(order_id: int, user_email: str) -> None:
    async with httpx.AsyncClient() as client:
        await client.post(
            "http://notifications.internal/send",
            json={"order_id": order_id, "email": user_email},
            timeout=5.0,
        )

async def handle_order_created(order_id: int, user_email: str) -> dict:
    """
    Persist order and schedule notification without blocking the response.
    """
    # ... persist order to DB here ...

    # Schedule notification in the background
    asyncio.create_task(_send_notification(order_id, user_email))

    return {"status": "ok", "order_id": order_id}
```
