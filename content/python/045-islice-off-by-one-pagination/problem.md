---
slug: islice-off-by-one-pagination
track: python
orderIndex: 45
title: Off-by-One in islice Pagination
difficulty: easy
tags:
  - correctness
  - iteration
  - api-misuse
language: python
---

## Context

This utility is in `api/pagination.py` and is used by several list endpoints to return paginated results from an in-memory sorted list (used for a small catalog that fits in RAM). Callers pass a 1-based page number and a page size; the function should return exactly `page_size` items for that page.

Users have reported that the last item of every page also appears as the first item of the next page, causing duplicate entries when clients concatenate pages. For example, with a list of 10 items and `page_size=3`, page 1 returns items 1–3 and page 2 returns items 3–5 instead of 4–6.

The bug is consistent and reproducible regardless of dataset size or page size. Unit tests written against the function only tested page 1 and therefore did not catch it.

## Buggy code

```python
from itertools import islice
from typing import TypeVar

T = TypeVar("T")

def paginate(items: list[T], page: int, page_size: int) -> list[T]:
    """Return a single page from `items`. `page` is 1-based."""
    start = (page - 1) * page_size
    end = start + page_size
    return list(islice(items, start - 1, end - 1))
```
