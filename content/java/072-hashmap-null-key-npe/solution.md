## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — getOrDefault Hides Null Value Bug
// ------------------------------------------------------------------------

import java.util.HashMap;
import java.util.Map;

public class FeatureFlags {
    private final Map<String, String> flags = new HashMap<>();

    public void load(Map<String, String> dbValues) {
        flags.putAll(dbValues);
    }

    public String getFlag(String key) {
        // CHANGE 1: Replace getOrDefault with containsKey+get so that keys explicitly mapped to null return null instead of "disabled"; getOrDefault treats a null value the same as a missing key.
        if (!flags.containsKey(key)) {
            return "disabled";
        }
        return flags.get(key);
    }

    public boolean isFlagEnabled(String key) {
        // CHANGE 2: Guard against a null return from getFlag (meaning "not configured") before calling equalsIgnoreCase, so null flags are treated as not-enabled rather than throwing an NPE or matching unexpectedly.
        String val = getFlag(key);
        return val != null && "true".equalsIgnoreCase(val);
    }
}
```

## Explanation

### Issue 1: `getOrDefault` Ignores Explicit Null Values

**Problem:** Any flag stored in the database with a `null` value is returned as `"disabled"` by `getFlag`. The caller has no way to distinguish "flag not in the map" from "flag explicitly set to null", and the intended "use system default" behaviour silently becomes "disabled".

**Fix:** Replace `flags.getOrDefault(key, "disabled")` with an explicit `flags.containsKey(key)` check. If the key is absent, return `"disabled"`; otherwise return `flags.get(key)`, which correctly returns `null` when that is the stored value.

**Explanation:** `HashMap.getOrDefault(key, defaultValue)` returns `defaultValue` whenever `get(key)` would return `null` — and `get` returns `null` for two distinct cases: the key is absent, and the key maps to `null`. The method cannot tell them apart, so any explicitly-stored `null` is treated as a missing key and the fallback wins. Using `containsKey` separates the two cases: the key is in the map (return whatever value it has, including `null`) versus the key is absent (return the fallback). A related pitfall is that `ConcurrentHashMap` does not allow `null` values at all, so the same pattern would throw on insertion there — but `HashMap` permits it, making the bug silent.

---

### Issue 2: `isFlagEnabled` Unsafe with Null Return

**Problem:** After the fix to `getFlag`, it can now return `null` for flags explicitly set to null. Calling `"true".equalsIgnoreCase(null)` returns `false` safely in Java, but the intent is ambiguous: a null flag means "not configured", which should not silently count as disabled either. If the internal logic ever changes so that `val.equalsIgnoreCase(...)` is used instead, a NullPointerException would be thrown.

**Fix:** Add a null guard before the `equalsIgnoreCase` call: `val != null && "true".equalsIgnoreCase(val)`. This makes the not-configured case explicit and safe.

**Explanation:** `"true".equalsIgnoreCase(val)` with `val == null` returns `false` because the String literal `"true"` receives the call and handles the null argument without throwing. However, the code's correctness depends on this specific call style; swapping to `val.equalsIgnoreCase("true")` would immediately throw. Adding `val != null &&` makes the null-safe contract explicit, documents that null is a meaningful sentinel, and removes the fragile dependency on which side of the equality check owns the call.
