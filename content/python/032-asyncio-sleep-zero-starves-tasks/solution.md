## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Asyncio Zero-Sleep Starves Other Tasks
# ------------------------------------------------------------------------

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

        # CHANGE 2: spawn one worker task per URL so feeds are fetched concurrently instead of sequentially, preventing one slow feed from blocking others.
        workers = [
            asyncio.create_task(_worker(session, queue, urls))
            for _ in urls
        ]
        await asyncio.gather(*workers)

async def _worker(session: aiohttp.ClientSession, queue: asyncio.Queue, urls: list[str]) -> None:
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
        # CHANGE 1: yield control to the event loop after each fetch so heartbeat and health-check tasks are not starved; asyncio.sleep(0) schedules a checkpoint without an actual delay.
        await asyncio.sleep(0)

def _process(data: bytes) -> None:
    pass
```

## Explanation

### Issue 1: Tight loop starves event loop

**Problem:** The health-check endpoint times out and websocket heartbeat pings are dropped even though CPU usage is low. The feed ingester reports healthy throughput, so the ingester itself is the cause of the starvation.

**Fix:** Add `await asyncio.sleep(0)` at the bottom of the loop body (after `queue.task_done()`) inside the new `_worker` coroutine. This inserts an explicit scheduler checkpoint after every fetch cycle.

**Explanation:** Python's `asyncio` event loop is cooperative: a coroutine runs uninterrupted until it hits an `await` that actually suspends it. `await queue.get()` suspends only when the queue is empty; `await fetch_feed(...)` suspends while waiting for network I/O. But when the queue stays populated and network responses arrive quickly, the loop can spin through many iterations handing control back to itself via the queue machinery without ever giving other tasks a turn. The health-check and heartbeat tasks sit in the ready queue but never get scheduled. `await asyncio.sleep(0)` tells the event loop "I'm done with this iteration; run anything else that is ready before coming back to me". This one call is enough to drain the ready queue of waiting tasks on every feed cycle, eliminating the starvation.

---

### Issue 2: Sequential fetching blocks on slow feeds

**Problem:** All feeds are fetched one at a time in a single coroutine. If one feed server is slow to respond, every other feed in the queue waits behind it, reducing overall throughput and increasing the time before any particular feed is refreshed.

**Fix:** Extract the per-URL loop into a `_worker` coroutine and use `asyncio.create_task` inside `ingest_feeds` to spawn one worker per URL, then `await asyncio.gather(*workers)` to run them all concurrently.

**Explanation:** The original code calls `await fetch_feed(...)` and then waits for it to complete before picking the next URL. During the network wait the coroutine is suspended, but no other fetch is happening — only one `get` is outstanding at a time. With N worker tasks each blocking on their own `queue.get()` and `session.get()`, the event loop can interleave all the network waits and saturate available bandwidth. Each worker independently refills the queue when it finds it empty, so the polling cycle continues without a central coordinator. One important pitfall: multiple workers refilling the queue simultaneously can add duplicate URLs; if deduplication matters you should guard the refill with a lock or move to a different scheduling strategy, but for a best-effort polling ingester the current behaviour is acceptable.
