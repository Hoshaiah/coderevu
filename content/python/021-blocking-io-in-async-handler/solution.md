## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Blocking I/O Inside Async Handler
# ------------------------------------------------------------------------

import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException
from PIL import Image
import io
from functools import partial

router = APIRouter()

def resize_image(source_path: str, width: int, height: int) -> bytes:
    with Image.open(source_path) as img:
        img = img.resize((width, height))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

@router.get("/thumbnail/{filename}")
async def get_thumbnail(filename: str, width: int = 128, height: int = 128):
    source = f"/var/media/originals/{filename}"
    # CHANGE 2: replaced blocking Path.exists() with async-friendly loop.run_in_executor so the filesystem stat does not stall the event loop
    loop = asyncio.get_event_loop()
    exists = await loop.run_in_executor(None, Path(source).exists)
    if not exists:
        raise HTTPException(status_code=404, detail="Image not found")

    # CHANGE 1: offload the CPU-bound resize_image call to a thread pool via run_in_executor so the event loop stays free to handle other requests
    data = await loop.run_in_executor(None, partial(resize_image, source, width, height))
    return {"size": len(data), "format": "png"}
```

## Explanation

### Issue 1: Blocking CPU-bound resize on event loop

**Problem:** `resize_image` calls Pillow's `Image.open`, `resize`, and `save` — all synchronous, CPU-intensive operations. Calling it directly in the `async` handler ties up the event loop thread for the full 30–80 ms of each resize. Under hundreds of concurrent requests, every other coroutine queues behind the running resize, and p99 latency balloons proportionally.

**Fix:** Wrap the `resize_image` call with `await loop.run_in_executor(None, partial(resize_image, source, width, height))`, moving it to the default `ThreadPoolExecutor` so the event loop thread is released while the work runs in a worker thread.

**Explanation:** Python's `asyncio` event loop is single-threaded. An `async` function that calls blocking code does not yield control — it holds the thread until the call returns, exactly like synchronous code would. `run_in_executor` submits the callable to a thread pool and returns an `awaitable`, so the event loop can process other callbacks while the thread works. The default executor uses `ThreadPoolExecutor`, which is appropriate here because Pillow releases the GIL for most image operations, allowing genuine parallelism. A related pitfall: if you need to limit concurrent resizes to avoid OOM, pass a custom `ThreadPoolExecutor` with a bounded `max_workers` instead of `None`.

---

### Issue 2: Blocking filesystem stat on event loop

**Problem:** `Path(source).exists()` issues a `stat` syscall on the event loop thread. Although a stat is usually fast, under high load the OS scheduler can delay it, and more importantly it holds the event loop thread — even briefly — preventing other coroutines from running during that time.

**Fix:** Replace the bare `Path(source).exists()` call with `await loop.run_in_executor(None, Path(source).exists)`, offloading the stat to a thread pool worker the same way the resize is offloaded.

**Explanation:** Any syscall, even a "fast" one like `stat`, can block if the filesystem is under pressure (e.g., a cold cache, a network-backed mount, or high inode contention). In an `async` handler every blocking call — however short — steals time from the event loop. Wrapping it with `run_in_executor` ensures the event loop thread is free to dispatch other requests during the wait. A related pitfall: `aiofiles` provides a higher-level async `os.path.exists` equivalent, and in Python 3.9+ `asyncio.to_thread` is a cleaner spelling of `run_in_executor(None, ...)`.
