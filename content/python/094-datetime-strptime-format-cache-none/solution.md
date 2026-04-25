## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — strptime Cold-Cache in Hot Loop
# ------------------------------------------------------------------------

from datetime import datetime
from typing import Iterator

LOG_FMT = "%d/%b/%Y:%H:%M:%S %z"

# CHANGE 1: Pre-warm the _strptime compiled-regex cache by calling strptime once before the loop so every subsequent call inside the hot loop finds the compiled format already cached and skips recompilation entirely.
datetime.strptime("01/Jan/2000:00:00:00 +0000", LOG_FMT)

# CHANGE 2: Bind datetime.strptime to a local name so the hot loop avoids repeated global/attribute lookups, which adds measurable overhead across millions of iterations.
_strptime = datetime.strptime

def parse_timestamps(lines: Iterator[str]) -> list[datetime]:
    results = []
    for line in lines:
        # extract the timestamp field from Apache combined log format
        try:
            ts_str = line.split("[")[1].split("]")[0]
            dt = _strptime(ts_str, LOG_FMT)  # CHANGE 2: use locally-bound reference instead of datetime.strptime
            results.append(dt)
        except (IndexError, ValueError):
            continue
    return results
```

## Explanation

### Issue 1: `strptime` format regex not cached across calls

**Problem:** The parse job jumps from 40 seconds to over 20 minutes after a 10x volume increase. `cProfile` shows `_strptime._strptime` consuming 85% of wall time. The team assumed Python caches the compiled format regex automatically, but that cache is only warm if `strptime` has already been called with the same format string in the same thread before the loop starts.

**Fix:** Add a single call to `datetime.strptime("01/Jan/2000:00:00:00 +0000", LOG_FMT)` at module import time, before `parse_timestamps` is ever invoked. This is `CHANGE 1` in the reference solution.

**Explanation:** Python's `_strptime` module keeps a module-level `_TimeRE` cache of compiled regular expressions keyed by format string. The first time any format is used, `_strptime` compiles the regex and stores it. Every subsequent call with the same format skips compilation and uses the cached object. The catch is that `datetime.strptime` is a C-level wrapper that delegates to `_strptime._strptime_datetime`, and the cache is only populated after the first real call. In a process that starts fresh for each batch run, the cache is cold when `parse_timestamps` begins. Making a throwaway call at module load time warms the cache immediately. A related pitfall: if the code ever runs on multiple threads, each thread has its own `_strptime` local state; the warm-up call must happen on each thread that will run the loop, or you should use `datetime.fromisoformat` / a third-party parser that does not have this per-thread cold-start behavior.

---

### Issue 2: Repeated global attribute lookup inside hot loop

**Problem:** Every iteration of the loop resolves `datetime.strptime` by looking up `datetime` in the module globals and then looking up `strptime` as an attribute. This is a small overhead per call, but across millions of calls it adds up to a measurable fraction of total runtime.

**Fix:** Bind `datetime.strptime` to the module-level name `_strptime` once before the function definition, then reference `_strptime(ts_str, LOG_FMT)` inside the loop. This is `CHANGE 2` in the reference solution.

**Explanation:** Python attribute lookup (`obj.attr`) and global name resolution each require a dictionary probe. Inside a tight loop that runs millions of times, eliminating one LOAD_ATTR and one LOAD_GLOBAL per iteration can shave several seconds off total runtime. Storing the callable in a local or module-level variable means the interpreter uses a faster LOAD_FAST or LOAD_NAME opcode instead. This technique is a standard micro-optimization for any frequently called method in a hot Python loop and is unrelated to the strptime cache issue — both fixes together produce the full speedup.
