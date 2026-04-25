## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — lru_cache With List Default Argument
# ------------------------------------------------------------------------

from functools import lru_cache
from typing import Tuple, Optional

@lru_cache(maxsize=256)
def weighted_sum(
    metrics: tuple,
    # CHANGE 1: default changed from mutable list [1.0, 1.0, 1.0] to immutable tuple (1.0, 1.0, 1.0) so lru_cache can hash it
    # CHANGE 2: annotation changed from List[float] to Tuple[float, ...] to accurately reflect the hashable type lru_cache requires
    weights: Tuple[float, ...] = (1.0, 1.0, 1.0),
) -> float:
    """
    Compute the dot product of metrics and weights.
    metrics must be a tuple of floats.
    weights defaults to equal weights for three metrics and must be a tuple.
    """
    if len(metrics) != len(weights):
        raise ValueError("metrics and weights must have the same length")
    return sum(m * w for m, w in zip(metrics, weights))
```

## Explanation

### Issue 1: Unhashable List Default Breaks `lru_cache`

**Problem:** When a caller omits `weights`, Python uses the default value `[1.0, 1.0, 1.0]` — a list — as the argument. `@lru_cache` must hash all arguments to build a cache key, and lists are not hashable, so Python immediately raises `TypeError: unhashable type: 'list'`. This happens on nearly every dashboard request that relies on the default.

**Fix:** Replace the default value `[1.0, 1.0, 1.0]` with the tuple `(1.0, 1.0, 1.0)` at the `CHANGE 1` site in the function signature.

**Explanation:** `lru_cache` stores results in a dictionary keyed by a tuple of all the call's arguments. Dictionary keys must be hashable. Lists are mutable and deliberately unhashable in Python, so the moment `lru_cache` tries to build the key it raises `TypeError`. Tuples are immutable and hashable, so switching the default to a tuple lets the cache key be constructed without error. Callers who were already passing explicit tuples for `weights` never hit this bug because their value was hashable from the start. A related pitfall: if you later add any other argument with a mutable default (e.g., a dict), the same crash will recur.

---

### Issue 2: `List[float]` Annotation Contradicts `lru_cache` Requirement

**Problem:** The type annotation `List[float]` signals to callers and type-checkers that passing a plain Python list is correct and expected. Any caller who follows the annotation and passes `weights=[0.5, 0.5, 0.5]` will get a `TypeError` at runtime, and the annotation provides no warning that `lru_cache` demands a hashable type.

**Fix:** Change the annotation from `List[float]` to `Tuple[float, ...]` at the `CHANGE 2` site, matching the actual runtime requirement.

**Explanation:** Type annotations in Python are not enforced at runtime, but they shape how other engineers use a function and what static analysers (mypy, pyright) flag. Keeping `List[float]` while requiring a tuple creates a false contract: callers do the right thing per the annotation, then get a cryptic runtime error. Changing to `Tuple[float, ...]` makes the constraint visible at the callsite and allows a type-checker to catch mismatches before deployment. The `...` in `Tuple[float, ...]` means a tuple of any length where every element is a `float`, which mirrors the flexible length already handled by the `len` check inside the function.
