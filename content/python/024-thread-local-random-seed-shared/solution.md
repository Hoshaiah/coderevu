## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Shared Random Instance Across Threads
# ------------------------------------------------------------------------

import random
import threading
from typing import List

# CHANGE 1: Use threading.local() so each thread gets its own Random instance, eliminating shared mutable state entirely.
_local = threading.local()

def sample_outcomes(seed: int, n: int) -> List[float]:
    """
    Generate n uniform samples reproducibly for a given seed.
    """
    # CHANGE 1: Retrieve (or create) a per-thread Random instance instead of touching the shared _rng.
    rng = _local.__dict__.setdefault('rng', random.Random())
    # CHANGE 2: seed() and all uniform() calls now happen on the thread-local instance, so acquiring a lock is unnecessary and has been removed.
    rng.seed(seed)
    results = []
    for _ in range(n):
        results.append(rng.uniform(0.0, 1.0))
    return results
```

## Explanation

### Issue 1: Shared RNG state mutated by concurrent threads

**Problem:** Every thread calls `_rng.seed(seed)` followed by `_rng.uniform()` on the same `random.Random` object. When two threads interleave, thread A's `seed()` call can overwrite the internal state that thread B just set, and each `uniform()` advances that shared state unpredictably. The result is that identical seeds produce different sample sequences depending on thread scheduling, which is exactly the histogram divergence the statisticians observed.

**Fix:** Replace the module-level `_rng = random.Random()` with `_local = threading.local()`, and inside `sample_outcomes` retrieve a per-thread `Random` instance via `_local.__dict__.setdefault('rng', random.Random())`. Each thread now owns its own isolated RNG object.

**Explanation:** `random.Random` stores its Mersenne Twister state as instance attributes. `seed()` rewrites that state, and every `uniform()` call advances it. When two threads share one instance, a context switch between `_rng.seed(seed)` and the first `_rng.uniform()` means one thread's seed is replaced by another's before any samples are drawn. `threading.local()` creates a namespace where each thread sees its own copy of every attribute stored there, so writes in thread A are invisible to thread B. The first time a thread calls `sample_outcomes` it creates a fresh `Random()` and stores it; subsequent calls from the same thread reuse it. A related pitfall: even if you wanted to keep a shared instance, wrapping the entire `seed + loop` block in a `Lock` would serialize all threads and eliminate parallelism — thread-local storage is the right tool here.

---

### Issue 2: Lock is declared but never used

**Problem:** `_lock = threading.Lock()` appears at module level, suggesting someone intended to serialize access to `_rng`, but `sample_outcomes` never calls `_lock.acquire()` or uses `with _lock:`. The lock therefore does nothing, and the race condition described in Issue 1 is fully exposed.

**Fix:** Remove the unused `_lock` variable entirely (it no longer appears in the reference solution) because the thread-local approach from Issue 1 makes a lock unnecessary — there is no shared state left to protect.

**Explanation:** A `Lock` only protects a resource if every code path that touches that resource actually acquires the lock before doing so. Declaring the lock without taking it is the same as not having one. If the fix had instead kept the shared `_rng` and added `with _lock:` around the seed-and-sample block, correctness would be restored but throughput would drop to effectively single-threaded for this function. The thread-local approach avoids that bottleneck while also making the lock dead code, so removing it prevents future readers from being misled into thinking synchronization is happening.
