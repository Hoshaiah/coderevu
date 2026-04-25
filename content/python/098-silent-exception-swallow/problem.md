---
slug: silent-exception-swallow
track: python
orderIndex: 98
title: Bare except clause hides all errors and returns stale data silently
difficulty: easy
tags:
  - error-handling
  - correctness
  - debugging
language: python
---

## Context

This function is part of a pricing microservice. It fetches the current price for a financial instrument from a remote HTTP API and is called on every incoming order. The team recently upgraded the HTTP library and started seeing orders execute at wildly wrong prices — but no errors appeared in the logs.

## Buggy code

```python
import urllib.request
import json

_price_cache: dict[str, float] = {}

def get_current_price(ticker: str) -> float:
    try:
        url = f"https://prices.internal/api/v1/quote?symbol={ticker}"
        with urllib.request.urlopen(url, timeout=2) as resp:
            data = json.loads(resp.read().decode())
            price = float(data["last_price"])
            _price_cache[ticker] = price
            return price
    except:
        return _price_cache.get(ticker, 0.0)
```
