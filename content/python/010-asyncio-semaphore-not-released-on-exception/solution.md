## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Semaphore Leaked on Request Error
# ------------------------------------------------------------------------

import asyncio
import aiohttp

MAX_CONCURRENT = 10
# CHANGE 2: Semaphore is now created lazily inside crawl() where an event loop is already running, avoiding the "no running event loop" error on Python 3.10+/3.12+.
sem: asyncio.Semaphore | None = None

async def fetch(session: aiohttp.ClientSession, url: str, _sem: asyncio.Semaphore) -> bytes:
    # CHANGE 1: Use `async with _sem` instead of bare acquire/release so the semaphore is always released even if an exception is raised inside the block.
    async with _sem:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            resp.raise_for_status()
            data = await resp.read()
    return data

async def crawl(urls: list[str]) -> list[bytes]:
    # CHANGE 2: Create the Semaphore here, inside the running coroutine, so it is bound to the correct event loop.
    sem = asyncio.Semaphore(MAX_CONCURRENT)
    async with aiohttp.ClientSession() as session:
        tasks = [fetch(session, url, sem) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if isinstance(r, bytes)]
```

## Explanation

### Issue 1: Semaphore Not Released on Exception

**Problem:** When any exception is raised inside `fetch` — for example, a non-2xx status triggers `raise_for_status()`, a network timeout fires, or `resp.read()` fails mid-stream — execution jumps out of the function without ever calling `sem.release()`. Each such failure permanently consumes one slot in the semaphore. After 10 such failures the semaphore counter reaches zero, `await sem.acquire()` blocks forever for every subsequent call, and the crawler stalls with no error message.

**Fix:** Replace the explicit `await sem.acquire()` / `sem.release()` pair with `async with _sem:` (the context-manager protocol on `asyncio.Semaphore`). The `__aexit__` method always calls `release()`, including when an exception unwinds the block.

**Explanation:** `asyncio.Semaphore` implements `__aenter__` and `__aexit__`, making it safe to use as an async context manager. When code inside an `async with` block raises, Python's runtime guarantees `__aexit__` is called before the exception propagates. The bare `acquire`/`release` pattern has no such guarantee — any early `return`, `raise`, or even a `CancelledError` from task cancellation skips the `release()` call. The Prometheus metric you observed (acquire counter rising, release counter stalling) is exactly the fingerprint of this leak: every error increments acquires but not releases.

---

### Issue 2: Semaphore Created Outside Event Loop

**Problem:** `asyncio.Semaphore(MAX_CONCURRENT)` runs at module import time, before any event loop is started. On Python 3.10+ this emits a `DeprecationWarning`; on Python 3.12+ it raises a `RuntimeError: no running event loop` immediately, preventing the module from loading at all.

**Fix:** Remove the module-level `sem` instantiation and instead create `asyncio.Semaphore(MAX_CONCURRENT)` at the top of `crawl()`, passing it as an argument `_sem` to each `fetch()` call so all tasks share the same semaphore instance.

**Explanation:** `asyncio` primitives like `Semaphore`, `Lock`, and `Event` internally reference the running event loop at construction time. When they are constructed at import time there is no loop yet, so the library either guesses wrong (Python < 3.10, picks the default loop) or refuses outright (Python 3.12+). Constructing the semaphore inside `crawl()` guarantees a loop is already running because `crawl` is itself a coroutine being awaited. Passing it explicitly as a parameter avoids module-level mutable state, which also makes unit-testing easier since each test can run `crawl()` in its own event loop without state bleed between runs.
