---
slug: asyncio-sleep-zero-starves-tasks
track: python
orderIndex: 32
title: Asyncio Zero-Sleep Starves Other Tasks
difficulty: medium
tags:
  - concurrency
  - asyncio
  - perf
language: python
---

## Context

This background worker lives in `workers/feed_ingester.py` and is responsible for polling a list of RSS feed URLs as fast as possible. It was written to maximise throughput by immediately requeuing completed work without any delay. The system runs dozens of other async tasks in the same event loop, including websocket heartbeat pings and a health-check endpoint.

Operators report that the health-check endpoint starts timing out intermittently under load, even though CPU utilisation is low. Websocket clients occasionally get disconnected because heartbeat pings are not sent within the required window. The feed ingester itself reports normal throughput.

## Buggy code

```python
import asyncio
import aiohttp

async def fetch_feed(session: aiohttp.ClientSession, url: str) -> bytes:
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
        return await resp.read()

async def ingest_feeds(urls: list[str]) -> None:
    async with aiohttp.ClientSession() as session:
        queue: asyncio.Queue = asyncio.Queue()
        for url in urls:
            await queue.put(url)

        while True:
            if queue.empty():
                for url in urls:
                    await queue.put(url)

            url = await queue.get()
            try:
                data = await fetch_feed(session, url)
                _process(data)
            except Exception:
                pass
            finally:
                queue.task_done()

def _process(data: bytes) -> None:
    pass
```
