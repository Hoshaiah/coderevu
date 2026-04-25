## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Default mutable argument silently shares state across all callers
# ------------------------------------------------------------------------
# CHANGE 1: Replace mutable default `{}` with `None` sentinel to avoid shared state
def build_request_params(endpoint: str, extra: dict = None) -> dict:
    # CHANGE 1: Create a fresh dict each call when no extra dict is provided
    if extra is None:
        extra = {}
    # CHANGE 2: Work on a copy so the caller's original dict is not mutated
    params = extra.copy()
    params["endpoint"] = endpoint
    params["version"] = "v2"
    params["format"] = "json"
    return params


# Called from two different request handlers:
params_a = build_request_params("search", {"q": "hello"})
params_b = build_request_params("trending")
params_c = build_request_params("trending")
```

## Explanation

### Issue 1: Mutable default argument shares state

**Problem:** Every call to `build_request_params` that omits `extra` operates on the exact same `{}` object that Python created when the `def` statement was executed. After the first such call, that dict already contains `"endpoint"`, `"version"`, and `"format"`. The second call adds new values on top of the old ones, so `params_b` and `params_c` end up seeing keys from each other, and the downstream API receives unexpected parameters causing 400 errors.

**Fix:** The default value for `extra` is changed from `{}` to `None`. Inside the function body, an `if extra is None:` guard creates a brand-new `{}` for each call that did not supply an argument. This is the standard Python idiom for avoiding mutable defaults.

**Explanation:** Python evaluates default argument expressions exactly once — at `def` time — not once per call. The resulting object is stored as part of the function object itself (`build_request_params.__defaults__`). Every call that relies on the default receives a reference to that same stored object, not a fresh copy. So mutations from one call persist into the next. Using `None` as the sentinel sidesteps this because `None` is immutable; the `if extra is None: extra = {}` line runs at call time, producing a new dict each time. A related pitfall: any other mutable type (list, set, custom object) as a default has the same problem.

---

### Issue 2: In-place mutation of caller-supplied dict

**Problem:** When a caller passes their own dict — like `{"q": "hello"}` — the function writes `"endpoint"`, `"version"`, and `"format"` directly into that dict. After the call, the caller's original dict has been silently modified. If the caller reuses that dict (e.g., to retry with different parameters), the injected keys are already present and may override or conflict with intended values.

**Fix:** A shallow copy is made with `params = extra.copy()` before any keys are added, and all subsequent writes go to `params` instead of `extra`. The caller's dict is left untouched, and `params` is returned.

**Explanation:** Python dicts are passed by reference. When `extra["endpoint"] = endpoint` executes, it modifies the object the caller handed in, not a local snapshot. The caller has no indication this happened unless they check their dict afterward. Taking a copy with `extra.copy()` creates a new dict with the same initial key-value pairs, so mutations stay local to the function. Note that `copy()` is a shallow copy — if the values themselves are mutable objects, nested mutations would still propagate. For this use case (string values), shallow copy is sufficient.
