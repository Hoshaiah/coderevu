---
slug: contextvar-token-not-reset
track: python
orderIndex: 37
title: ContextVar Token Never Reset
difficulty: hard
tags:
  - concurrency
  - context-management
  - asyncio
language: python
---

## Context

This middleware lives in `middleware/request_context.py` in an async FastAPI application. It sets a `ContextVar` to hold the current authenticated user for the duration of each request, so that downstream service functions can call `get_current_user()` without threading the user object through every function parameter. `ContextVar` was chosen specifically to be async-safe — each task gets its own context.

The bug manifests as users occasionally seeing data belonging to a different user. It's rare, hard to reproduce, and only happens under high concurrency. Audit logs show the wrong `user_id` being recorded for certain database writes. The team initially suspected a caching bug but found no shared cache. They then suspected connection pool bleed but database connections are scoped correctly.

Stress tests show the contamination correlates with requests that raise exceptions (e.g. 422 validation errors or 500s) — clean requests appear unaffected. The root cause is in how the `ContextVar` is set and cleared in the middleware.

## Buggy code

```python
from contextvars import ContextVar
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

_current_user: ContextVar[dict | None] = ContextVar("current_user", default=None)

def get_current_user() -> dict | None:
    return _current_user.get()

class UserContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        user = await _resolve_user_from_request(request)
        _current_user.set(user)
        try:
            response = await call_next(request)
        finally:
            _current_user.set(None)
        return response

async def _resolve_user_from_request(request: Request) -> dict | None:
    token = request.headers.get("X-Auth-Token", "")
    # Simplified: look up user by token
    if token == "valid-token":
        return {"user_id": 42, "role": "user"}
    return None
```
