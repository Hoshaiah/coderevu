## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Redundant JSON Decode in Hot Loop
# ------------------------------------------------------------------------

import json

def extract_user_ids(raw_events: list[bytes], target_type: str) -> list[str]:
    """
    Filter events by `target_type` and return the `user_id` field.
    """
    # CHANGE 1+2: Parse each raw payload exactly once and bind to `event`, then filter on the already-parsed dict — eliminates the duplicate json.loads call per matched event and avoids re-parsing inside the condition expression.
    matching = [
        event
        for raw in raw_events
        for event in (json.loads(raw),)
        if event.get("type") == target_type
    ]
    return [event["user_id"] for event in matching]
```

## Explanation

### Issue 1: Duplicate `json.loads` on matched events

**Problem:** Every event whose `type` matches `target_type` is parsed by `json.loads` twice — once to evaluate the `if` condition and once to produce the value in the list comprehension. With a few hundred events and a high match rate, the parser runs far more times than expected, which shows up as outsized CPU usage in profiler traces.

**Fix:** The inner `for event in (json.loads(raw),)` loop at the CHANGE 1+2 site parses `raw` a single time and binds the result to `event`. The `if event.get("type") == target_type` condition and the comprehension value both reference that already-parsed `event` dict, so `json.loads` is called exactly once per payload.

**Explanation:** The original list comprehension has the form `[json.loads(raw) for raw in ... if json.loads(raw).get(...)]`. Python evaluates the `if` expression first; if it is truthy, Python then evaluates the value expression. Because the value expression also calls `json.loads(raw)` independently, the JSON parser runs a second time on the same bytes. Using a nested single-element tuple loop (`for event in (json.loads(raw),)`) is a standard Python idiom to introduce a temporary binding inside a comprehension without needing a helper function. A related pitfall: if you try to move the call into a walrus operator (`if (event := json.loads(raw)).get(...)`), that works too, but the tuple loop is more readable and compatible with Python 3.7 and earlier.

---

### Issue 2: Parsing every payload even when most are discarded

**Problem:** The original `if` condition calls `json.loads(raw)` for every single payload in the batch, including ones that do not match `target_type`. All that parsing work is thrown away for non-matching events. If most events are not of the target type, this is the dominant source of wasted CPU.

**Fix:** The CHANGE 1+2 site consolidates parsing into one call per payload via the `for event in (json.loads(raw),)` idiom. There is no separate parse in the `if` branch, so non-matching events still pay the cost of one parse (unavoidable without a cheaper pre-filter), but matched events no longer pay twice.

**Explanation:** Avoiding redundant work requires that the parsed object is produced once and reused. In a generator or list comprehension, Python has no built-in "let binding", so developers often reach for calling the same function in both the value and the condition — which silently doubles work. The tuple loop trick works because the inner `for` iterates over a one-element sequence, executing `json.loads(raw)` exactly once and making the result available as `event` for both the `if` guard and the output expression. If a cheaper pre-filter were available (e.g., checking the raw bytes for the type string before parsing), that could further reduce parse calls for large batches where most events are irrelevant.
