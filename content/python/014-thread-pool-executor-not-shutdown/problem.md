---
slug: thread-pool-executor-not-shutdown
track: python
orderIndex: 14
title: ThreadPoolExecutor Never Shut Down
difficulty: hard
tags:
  - resource-management
  - concurrency
  - thread-management
language: python
---

## Context

This helper is in `notifications/email_sender.py`. It uses a `ThreadPoolExecutor` to fire-and-forget email delivery calls without blocking request handlers. Each time `send_notification` is called, a new executor is created to dispatch the work.

After the service has been running for a few hours under normal load, the process holds thousands of idle threads as reported by `ps -T` and `/proc/<pid>/status`. Thread creation eventually fails with `RuntimeError: can't start new thread`, and the service stops responding. The thread count climbs monotonically since the service started.

The team already confirmed the `_deliver` function itself completes successfully and does not block indefinitely. They also confirmed there are no uncaught exceptions inside the submitted tasks.

## Buggy code

```python
import smtplib
import threading
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage

def send_notification(to: str, subject: str, body: str) -> None:
    executor = ThreadPoolExecutor(max_workers=4)
    executor.submit(_deliver, to, subject, body)

def _deliver(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg["From"] = "noreply@example.com"
    msg.set_content(body)
    with smtplib.SMTP("localhost", 25) as smtp:
        smtp.send_message(msg)
```
