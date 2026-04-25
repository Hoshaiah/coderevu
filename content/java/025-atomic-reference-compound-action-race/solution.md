## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Non-Atomic Check-Then-Act on AtomicReference
// ------------------------------------------------------------------------

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

public class FeatureFlagCache {
    private final AtomicReference<Map<String, Boolean>> flagsRef =
        new AtomicReference<>(Map.of());

    public void refresh(Map<String, Boolean> newFlags) {
        flagsRef.set(Map.copyOf(newFlags));
    }

    public boolean isEnabled(String flag) {
        // CHANGE 1: Read the reference exactly once into a local variable so both the null-check and the map lookup operate on the same snapshot, eliminating the TOCTOU window.
        Map<String, Boolean> snapshot = flagsRef.get();
        // CHANGE 2: Guard against null using the locally captured snapshot instead of calling flagsRef.get() a second time; in practice snapshot is never null here because the field is always initialized, but the guard is kept for safety against subclass misuse.
        if (snapshot == null) {
            return false;
        }
        return snapshot.getOrDefault(flag, false);
    }
}
```

## Explanation

### Issue 1: Double `flagsRef.get()` TOCTOU Race

**Problem:** The original `isEnabled` calls `flagsRef.get()` twice: once for the null-check and again to retrieve the map. Between those two calls the refresher thread can call `flagsRef.set(newMap)`. The first call returns the old map (non-null, so the guard passes), but the second call could return a completely different map object — or, in a pathological reordering, could even theoretically return null if the reference were ever set to null. In practice at 5000 RPS this window causes requests to read from a different snapshot than the one they checked, which explains flags appearing to vanish or lag.

**Fix:** Assign the result of one `flagsRef.get()` to a local variable called `snapshot`, then use `snapshot` for both the null-check and the `getOrDefault` call. The relevant tokens are `Map<String, Boolean> snapshot = flagsRef.get()` and the replacement of the second `flagsRef.get()` with `snapshot`.

**Explanation:** `AtomicReference.get()` is atomic per individual call, but atomicity does not span two separate calls. Any code of the form "check the reference, then use the reference" has a window where another thread can change the reference in between. By reading once into a local, you get a stable reference for the lifetime of the method call — other threads can update `flagsRef` all they want, but this invocation is working with its own consistent snapshot. This is the same pattern used for all lock-free reads on shared references: read once, work with the local copy. A related pitfall is doing `if (ref.get().containsKey(k)) return ref.get().get(k)` — same race, same fix.

---

### Issue 2: Redundant and Misleading Null-Check

**Problem:** The field `flagsRef` is initialized to `Map.of()` (never null) and `refresh()` always stores `Map.copyOf(newFlags)` (also never null). The null-check on `flagsRef.get()` can never be true in any reachable code path, so it gives maintainers a false impression that null is a valid state and that calling `flagsRef.get()` twice is somehow intentional.

**Fix:** Move the null-check to operate on the local `snapshot` variable instead of a raw `flagsRef.get()` call. The check is now `if (snapshot == null)` where `snapshot` was already captured once. This keeps a defensive guard without creating a second live call to `flagsRef.get()`.

**Explanation:** Dead or misleading guards are a maintenance hazard: the next engineer who reads the original code might conclude that null is expected and add code paths that set `flagsRef` to null, recreating the problem intentionally. Keeping the guard but pointing it at the already-captured `snapshot` costs nothing, documents the invariant implicitly ("we checked"), and does not reintroduce the two-call race. If someone later changes the initializer or adds a code path that could store null, the guard will catch it without needing a second atomic read.
