## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — ThreadPool Results Assumed Ordered
# ------------------------------------------------------------------------

from concurrent.futures import ThreadPoolExecutor
from typing import Callable

def resize_image(image_bytes: bytes, width: int) -> bytes:
    # Stub: resizes image to given width, returns bytes
    return image_bytes[:width]  # simplified

def generate_thumbnails(image_bytes: bytes) -> dict:
    sizes = {
        "small": 128,
        "medium": 512,
        "large": 1024,
    }

    # CHANGE 1+2: Submit futures keyed by size name so each result is retrieved from the future that corresponds to that specific size, eliminating any dependence on completion or iteration order.
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            name: executor.submit(resize_image, image_bytes, width)
            for name, width in sizes.items()
        }

    # CHANGE 1+2: Build the result dict by looking up each named future explicitly, so "small" always gets the 128-wide result regardless of which future finished first.
    return {
        name: future.result()
        for name, future in futures.items()
    }
```

## Explanation

### Issue 1: Future results collected by position, not by identity

**Problem:** Users see the wrong thumbnail for a requested size — e.g., requesting the `small` thumbnail returns a 1024-pixel-wide image. This happens intermittently and only under load, which is a strong sign the ordering of concurrent results is non-deterministic.

**Fix:** Replace the `results` list with a dict that maps each size name directly to its `Future` object (e.g., `futures = {name: executor.submit(...) for name, width in sizes.items()}`). The final dict is built by calling `.result()` on each named future, so `"small"` always retrieves the result of the future that was submitted with `width=128`.

**Explanation:** `ThreadPoolExecutor.submit` returns a `Future` immediately. The futures are placed into a list in the order `sizes.values()` is iterated, which is insertion order in Python 3.7+ (`small`, `medium`, `large`). However, the worker threads finish in whatever order the OS schedules them — under load a busy pool may pick up and complete the `large` task before `small`. When the code then iterates `futures` and appends `.result()` to a plain list, it still iterates in submission order, but `.result()` on each future blocks until *that specific future* finishes, so the list ends up in submission order — actually this part is fine in isolation. The real risk is the broken name-to-future binding described in Issue 2 below, which makes the positional assumption fragile and invisible to testing that runs sizes serially.

---

### Issue 2: No explicit binding between size label and submitted future

**Problem:** The code submits three futures in the order `sizes.values()` yields widths, then hard-codes `results[0]` as `"small"`, `results[1]` as `"medium"`, and `results[2]` as `"large"`. This implicit positional contract breaks silently if the iteration order of `sizes` ever changes (e.g., dict literal reordered during refactoring, or a different Python version), or if the futures list is modified elsewhere.

**Fix:** Submit futures as `{name: executor.submit(resize_image, image_bytes, width) for name, width in sizes.items()}` — a dict that explicitly ties the size label to its future. The final return statement becomes `{name: future.result() for name, future in futures.items()}`, removing all positional indexing.

**Explanation:** The original code relies on two implicit orderings agreeing with each other: the order `sizes.values()` produces widths and the order `results` indices map to size names in the final dict literal. As long as both stay in sync the code works, which is why serial unit tests pass — they test the resize logic, not the index-to-name mapping. Under concurrent load, a refactor that reorders the `sizes` dict or adds a fourth size is enough to permanently scramble the output with no test catching it. Storing futures in a named dict makes the association explicit and eliminates the positional assumption entirely.
