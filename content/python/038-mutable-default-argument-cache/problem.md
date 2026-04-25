---
slug: mutable-default-argument-cache
track: python
orderIndex: 38
title: Default mutable argument silently shares state across all callers
difficulty: easy
tags:
  - correctness
  - api-misuse
  - python-gotcha
language: python
---

## Context

This utility function is used throughout a web application to build query parameter dictionaries for outgoing API requests. Developers noticed that after the first few requests, the `params` dict sometimes contains keys from completely unrelated calls — causing mysterious 400 errors from the downstream API.

## Buggy code

```python
def build_request_params(endpoint: str, extra: dict = {}) -> dict:
    extra["endpoint"] = endpoint
    extra["version"] = "v2"
    extra["format"] = "json"
    return extra


# Called from two different request handlers:
params_a = build_request_params("search", {"q": "hello"})
params_b = build_request_params("trending")
params_c = build_request_params("trending")
```
