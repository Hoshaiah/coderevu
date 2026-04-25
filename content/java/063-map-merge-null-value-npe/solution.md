## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Map.merge Throws NPE on Null Value
// ------------------------------------------------------------------------

import java.util.HashMap;
import java.util.Map;

public class EventAggregator {
    private final Map<String, Integer> counts = new HashMap<>();

    public void aggregateCounts(String eventType, int delta) {
        // CHANGE 1: Replace merge-with-null-return with a manual get/put/remove pattern. Map.merge's remapping function must not return null on HashMap in Java 8 — it throws NPE instead of removing the key as the javadoc implies.
        Integer oldVal = counts.get(eventType);
        if (oldVal == null) {
            // CHANGE 2: Only insert a new key when the resulting count would be non-zero; inserting a zero-count entry is meaningless and wastes space.
            if (delta != 0) {
                counts.put(eventType, delta);
            }
        } else {
            int sum = oldVal + delta;
            if (sum == 0) {
                // CHANGE 1: Explicitly remove the key instead of returning null from a remapping function, which is what caused the NPE.
                counts.remove(eventType);
            } else {
                counts.put(eventType, sum);
            }
        }
    }

    public int getCount(String eventType) {
        return counts.getOrDefault(eventType, 0);
    }
}
```

## Explanation

### Issue 1: `Map.merge` NPE on Null Remapping Return

**Problem:** The consumer thread crashes with a `NullPointerException` inside `HashMap.merge` whenever `sum` equals zero and the lambda returns `null`. The crash only happens when the key already exists in the map, so it surfaces only after a key has been seen at least once before its count reaches zero.

**Fix:** Remove the `counts.merge(...)` call entirely. Replace it with an explicit `counts.get` / `counts.put` / `counts.remove` sequence (the `CHANGE 1` sites). When `sum == 0`, call `counts.remove(eventType)` directly instead of signalling removal through a null return value.

**Explanation:** The `Map.merge` javadoc says "if the remapping function returns null, the mapping is removed", but the `HashMap` implementation in Java 8 does not honour this for an existing key — it tries to unbox the null `Integer` return value and throws `NPE` instead. Java 9+ fixed this, but many production runtimes are still on Java 8 or early Java 11 builds where the behaviour is inconsistent. The safe approach is to never return `null` from a remapping function and to perform removals explicitly. A related pitfall: `Map.compute` has the same null-return-removes contract, and it also misbehaves on some JDK versions when the value is a primitive wrapper type.

---

### Issue 2: Zero-Delta Insert Creates Useless Zero-Count Entry

**Problem:** If `aggregateCounts` is called with `delta == 0` and the key does not yet exist, the original code calls `counts.merge(eventType, 0, ...)` which inserts the key with value `0`. That entry is semantically meaningless because `getCount` would return `0` whether the key is present or absent, but it occupies space and can confuse future callers who iterate the map.

**Fix:** At the `CHANGE 2` site, wrap the initial `counts.put(eventType, delta)` in a guard `if (delta != 0)` so that a zero delta against a missing key is a no-op.

**Explanation:** `Map.merge` always stores the provided value when no existing mapping is found, regardless of whether that value is meaningful. Because `getCount` already falls back to `0` via `getOrDefault`, storing an explicit `0` adds no information. In a rolling-window scenario where keys are added and expired frequently, these ghost entries accumulate and can mislead any code that checks `counts.containsKey` or iterates `counts.entrySet()` expecting only live, non-zero counts.
