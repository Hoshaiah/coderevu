## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Unnecessary deepcopy in Tight Loop
# ------------------------------------------------------------------------

import copy
from typing import Any

RULES: list[dict] = []  # loaded once at startup, never mutated after load

def evaluate_event(event: dict[str, Any]) -> list[str]:
    """Return the names of all rules that match the event."""
    matched = []
    for rule in RULES:
        # CHANGE 1: Removed deepcopy — _matches is read-only and never mutates the rule dict, so copying every rule on every event is pure waste.
        if _matches(rule, event):
            # CHANGE 2: Read "name" directly from the original rule instead of a now-deleted copy.
            matched.append(rule["name"])
    return matched

def _matches(rule: dict, event: dict[str, Any]) -> bool:
    for condition in rule["conditions"]:
        field = condition["field"]
        expected = condition["value"]
        if event.get(field) != expected:
            return False
    return True
```

## Explanation

### Issue 1: `deepcopy` on read-only data in hot loop

**Problem:** Every call to `evaluate_event` runs `copy.deepcopy(rule)` once per rule before doing anything with it. Under load, with thousands of events per second and dozens of rules each, this creates enormous allocation and garbage-collection pressure. Flame graphs confirm this single line accounts for 60% of total CPU time.

**Fix:** Remove the `rule_copy = copy.deepcopy(rule)` line entirely and pass `rule` directly to `_matches`. The `copy` import can also be removed since it is no longer used.

**Explanation:** `deepcopy` recursively copies every nested object — the rule dict, its `"conditions"` list, and each condition dict inside it. That is O(depth × size) allocation work per rule per event. The original defensive copy was added after a mutation bug, but that bug was fixed in `_matches` itself. `_matches` now only reads `condition["field"]` and `condition["value"]`; it never assigns to or mutates any part of the rule structure. Because `RULES` is loaded once and never written after startup, sharing the original dict across concurrent workers is safe. Removing the copy eliminates the allocation entirely rather than optimising it, which is the correct outcome when the copy was never needed.

---

### Issue 2: Appending name from the copy instead of the original rule

**Problem:** After the deepcopy was introduced, `matched.append(rule_copy["name"])` reads the name from the throwaway copy. This is not a correctness bug on its own (the value is identical), but it ties the data-access path to the copy, making it look like the copy is needed for the read, which it is not.

**Fix:** Replace `matched.append(rule_copy["name"])` with `matched.append(rule["name"])`, reading directly from the original rule dict that is already in scope.

**Explanation:** When `rule_copy` is removed, any reference to it must also go. Beyond mechanical necessity, reading from the original `rule` is clearer about ownership: the function receives data from `RULES`, evaluates it, and returns names from it. A reader encountering `rule_copy["name"]` might assume the copy exists because the name field is somehow modified during evaluation, which is misleading. Using `rule["name"]` directly communicates that evaluation is a pure read operation on shared data.
