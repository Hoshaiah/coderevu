---
slug: pickle-load-arbitrary-code-exec
track: python
orderIndex: 57
title: Pickle Deserializes Untrusted User Data
difficulty: easy
tags:
  - correctness
  - security
  - serialization
language: python
---

## Context

This function lives in `app/session.py` and is responsible for restoring user session objects from a Redis cache. The sessions were originally serialized with `pickle` for convenience because the session objects contain custom Python types that don't serialize cleanly to JSON. The function is called on every authenticated request from the API gateway middleware.

Security auditors have flagged this endpoint as a potential remote code execution vector. Developers on the team are unsure why — the data comes from Redis, which is an internal service, not directly from users. They've pointed out that the Redis cluster is on a private subnet and requires a password.

What's been ruled out: the Redis password is correctly set and the cluster is not publicly reachable. However, auditors note that the session cookie itself contains the raw pickled bytes encoded as base64, which the client sends on every request — and that value is what gets written to Redis in the first place.

## Buggy code

```python
import pickle
import base64
from flask import request, abort

def restore_session(session_cookie: str) -> dict:
    """
    Decode a session cookie and restore the session object.
    The cookie value is base64-encoded pickled session data.
    """
    try:
        raw = base64.b64decode(session_cookie)
        session = pickle.loads(raw)
        if not isinstance(session, dict):
            abort(400)
        return session
    except (pickle.UnpicklingError, ValueError):
        abort(400)

def get_current_user():
    cookie = request.cookies.get("session", "")
    if not cookie:
        abort(401)
    session = restore_session(cookie)
    return session.get("user_id")
```
