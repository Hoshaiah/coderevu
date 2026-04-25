## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Generator Coroutine Used Before Priming
# ------------------------------------------------------------------------

from typing import Generator

def running_average() -> Generator[float, float, None]:
    """
    Coroutine generator. Send numeric values; receive running average.
    Usage:
        gen = running_average()
        avg = gen.send(3.5)   # should yield 3.5
    """
    total = 0.0
    count = 0
    # CHANGE 2: Combine the initial yield with value capture so the first sent value is not discarded; the generator waits here and accepts the first real value in one step.
    value = yield 0.0
    while True:
        total += value
        count += 1
        value = yield total / count


def run_pipeline(readings: list[float]) -> list[float]:
    gen = running_average()
    # CHANGE 1: Prime the generator by calling next() before any send(), advancing it to the first yield so subsequent send() calls work without TypeError.
    next(gen)
    results = []
    for reading in readings:
        avg = gen.send(reading)
        results.append(avg)
    return results
```

## Explanation

### Issue 1: Generator Not Primed Before First Send

**Problem:** `run_pipeline` calls `gen.send(reading)` immediately after creating the generator. Python raises `TypeError: can't send non-None value to a just-started generator` on the very first sensor reading. The pipeline crashes or, with the workaround the team added, silently drops the first value.

**Fix:** Insert `next(gen)` after `gen = running_average()` and before the loop. This is the `# CHANGE 1` site in `run_pipeline`.

**Explanation:** A generator function does not execute any of its body when you call it — it just returns a generator object frozen at the start. The first call must use `next()` (or equivalently `gen.send(None)`) to run the body up to the first `yield`. Only after that suspension point is reached can you send a real value. Skipping this step means Python has nowhere to deliver the value, so it raises `TypeError`. The `next(gen)` call advances the generator to `value = yield 0.0` and suspends it there, ready to receive a real number. A common pitfall is forgetting to prime in asynchronous or framework-driven pipelines where the generator is created and used in different places — a decorator that auto-primes (calls `next` internally) is a pattern worth knowing for those cases.

---

### Issue 2: First Yield Discards the Sent Value

**Problem:** The original code uses `value = yield` with no expression on the right of `yield`. Even if the generator were correctly primed, the first `send()` after priming would land here, capture the value, but the *priming* `next()` call would reach this same yield and return `None` to the caller — meaning the structure of the yield is fine for priming, but the discarding happens because a bare `yield` with no expression yields `None` and the design intent (yield a meaningful sentinel or combine yield and value capture) is muddled.

**Fix:** Replace `value = yield` with `value = yield 0.0` at `# CHANGE 2`. The priming `next(gen)` now receives `0.0` (an ignorable sentinel), and the first real `send(reading)` deposits `reading` into `value` so it is included in the running total.

**Explanation:** In a coroutine, `x = yield expr` does two things: it sends `expr` out to whoever called `next()` or `send()`, and it suspends until the next `send(v)`, at which point `x` receives `v`. The bare `yield` yields `None` during priming, which is harmless, and the first real `send()` correctly sets `value`. The key fix is ensuring the sentinel yield expression (`0.0`) makes the priming return value explicit and intentional, not `None`, which callers might misinterpret. The first real reading then flows into `total` and `count` correctly, so no data is dropped and the running average is unbiased from the start.
