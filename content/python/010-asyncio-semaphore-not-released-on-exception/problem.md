---
slug: asyncio-semaphore-not-released-on-exception
track: python
orderIndex: 10
title: Semaphore Leaked on Request Error
difficulty: medium
tags:
  - resource-management
  - asyncio
  - concurrency
language: python
---

## Context

This code is in `services/fetcher.py`, an async HTTP client wrapper used by a crawler that must not overwhelm a third-party API. A `Semaphore` is used to cap the number of concurrent outbound requests to 10. The crawler runs thousands of URLs per hour.

After running for a few hundred URLs, the crawler silently stalls — no errors appear in the log, all in-flight requests seem to have completed, but no new requests are dispatched. The process hangs indefinitely until killed.

Checking open connections shows zero active HTTP connections, so the stall is not a connection leak. Prometheus metrics show the semaphore acquire counter keeps rising but the release counter stops increasing after a certain number of errors.

## Buggy code

```python
import asyncio
import aiohttp

MAX_CONCURRENT = 10
sem = asyncio.Semaphore(MAX_CONCURRENT)

async def fetch(session: aiohttp.ClientSession, url: str) -> bytes:
    await sem.acquire()
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
        resp.raise_for_status()
        data = await resp.read()
    sem.release()
    return data

async def crawl(urls: list[str]) -> list[bytes]:
    async with aiohttp.ClientSession() as session:
        tasks = [fetch(session, url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, bytes)]
```
