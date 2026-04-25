---
slug: threadlocal-request-bleed
track: python
orderIndex: 20
title: Thread-Local State Bleeds Between Requests
difficulty: medium
tags:
  - concurrency
  - threading
  - web
language: python
---

## Context

This module lives in `auth/context.py` inside a multi-threaded Flask application served by Gunicorn in sync (threaded) mode. The pattern is meant to store the currently authenticated user for the duration of a request so that business-logic functions can call `get_current_user()` without threading user objects through every call.

A small number of users have reported seeing data that belongs to another account — for example, saving a document and finding it attributed to a different user. The bug is intermittent and only appears under moderate-to-high concurrency. It never shows up in single-threaded local development.

Logging was added around the login endpoint and confirmed that authentication itself is correct — the right user object is being stored at login time. The bleed happens later in the same request or in a subsequent one.

## Buggy code

```python
import threading

_local = threading.local()
_current_user = None  # module-level fallback

def set_current_user(user):
    _current_user = user

def get_current_user():
    return _current_user

def clear_current_user():
    global _current_user
    _current_user = None
```
