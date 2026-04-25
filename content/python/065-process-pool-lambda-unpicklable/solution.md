## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Lambda Breaks ProcessPoolExecutor
# ------------------------------------------------------------------------

import csv
from concurrent.futures import ProcessPoolExecutor
from functools import partial  # CHANGE 1: import partial so we can build a picklable callable
from typing import Callable

def score_vector(features: list[float], threshold: float) -> dict:
    total = sum(f * (i + 1) for i, f in enumerate(features))
    return {"score": total, "pass": total >= threshold}

def run(input_rows: list[list[float]], threshold: float, workers: int = 4) -> list[dict]:
    # CHANGE 2: replace the unpicklable lambda closure with functools.partial, which wraps a module-level function and is safely picklable across process boundaries
    scorer = partial(score_vector, threshold=threshold)
    results = []
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for result in pool.map(scorer, input_rows):
            results.append(result)
    return results
```

## Explanation

### Issue 1: Lambda closure unpicklable by worker processes

**Problem:** When `ProcessPoolExecutor` sends work to a child process, it must serialize (pickle) the callable and its arguments. A `lambda` defined inside `run` is a closure that only exists inside that local scope; Python's pickler cannot locate it by module-level name, so it raises `AttributeError: Can't pickle local object 'run.<locals>.<lambda>'` immediately when the first task is submitted.

**Fix:** Replace `scorer = lambda row: score_vector(row, threshold)` with `scorer = partial(score_vector, threshold=threshold)`, and add `from functools import partial` at the top of the file (CHANGE 1 and CHANGE 2).

**Explanation:** `ProcessPoolExecutor` uses Python's `multiprocessing` module under the hood, which relies on `pickle` to move callables and data between the main process and worker processes. `pickle` serializes a function by recording its fully-qualified module path (e.g., `jobs.score_batch.score_vector`). A `lambda` or any nested function has no stable module-level path, so `pickle` raises an error when it tries to serialize it. `functools.partial` wraps `score_vector` — a real module-level function — together with the pre-bound keyword argument `threshold`. Because `score_vector` is importable by name and `threshold` is a plain `float`, the `partial` object pickles without issue. `ThreadPoolExecutor` avoids this entirely because threads share memory with the parent process and never need to pickle callables, which is why the developer saw it work there — but that observation masked the real problem in the code rather than fixing it.

---

### Issue 2: `partial` argument must be passed as keyword to match function signature

**Problem:** `score_vector` has the signature `(features, threshold)`. If `partial` is called as `partial(score_vector, threshold)` (positional), `threshold` gets bound to the first positional slot (`features`), so every call receives `threshold` as the feature list and the actual row as `threshold`, producing wrong results silently.

**Fix:** At CHANGE 2, `partial` is called with `threshold=threshold` as an explicit keyword argument, matching the parameter name in `score_vector`'s signature exactly.

**Explanation:** `functools.partial` binds arguments left-to-right when they are positional. `score_vector`'s first parameter is `features`, so `partial(score_vector, threshold)` would bind the value of `threshold` to `features`, leaving the second parameter free — meaning the row passed by `pool.map` would be interpreted as the threshold. Using the keyword form `partial(score_vector, threshold=threshold)` leaves `features` unbound so `pool.map` fills it correctly with each row. A related pitfall: if you later add a new positional parameter before `threshold` in `score_vector`, a positional `partial` binding silently shifts again, while the keyword form raises a `TypeError` immediately, making the bug obvious.
