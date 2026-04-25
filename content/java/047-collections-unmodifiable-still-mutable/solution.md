## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Unmodifiable View Wraps Mutable Reference
// ------------------------------------------------------------------------

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class FeatureFlags {

    private Map<String, Boolean> flags = new HashMap<>();
    // CHANGE 2: publicView is now assigned after flags is populated, so the view never wraps an empty map on construction.
    private Map<String, Boolean> publicView;

    public FeatureFlags(Map<String, Boolean> initial) {
        flags.putAll(initial);
        // CHANGE 2: moved publicView assignment here, after putAll, so the unmodifiable view sees the initial entries immediately.
        publicView = Collections.unmodifiableMap(flags);
    }

    /** Hot-reload flags without restarting the server. */
    // CHANGE 3: synchronized so that a reload and a concurrent getFlags() cannot race; the new map and new view are published atomically.
    public synchronized void reload(Map<String, Boolean> newFlags) {
        // CHANGE 1: mutate the existing map in-place instead of replacing it, so the already-published unmodifiable view still wraps the live data.
        flags.clear();
        flags.putAll(newFlags);
    }

    // CHANGE 3: synchronized so readers always see a consistent, fully-written map.
    public synchronized Map<String, Boolean> getFlags() {
        return publicView;
    }
}
```

## Explanation

### Issue 1: Unmodifiable View Wraps Replaced Map

**Problem:** After `reload()` runs, callers who already hold a reference to the map returned by `getFlags()` — or who call `getFlags()` again after the reload — may see different flag sets within the same request. The unmodifiable wrapper they received before the reload still reflects the old `HashMap`, while a new `HashMap` backs the field.

**Fix:** Replace the `flags = new HashMap<>(newFlags)` assignment in `reload()` with `flags.clear(); flags.putAll(newFlags)`. This mutates the existing map object in place, so `publicView` — which wraps that same object — automatically reflects the updated entries.

**Explanation:** `Collections.unmodifiableMap` returns a thin decorator that delegates reads directly to the map instance passed in at creation time. When `reload()` does `flags = new HashMap<>(newFlags)`, the `flags` field now points at a brand-new object, but `publicView` still holds a reference to the original `HashMap`. Any thread that calls `getFlags()` after the reload returns a view of the new map — but threads that captured the view before the reload still read from the old map. Mutating the contents of the original map instead keeps both references in sync. A related pitfall: if you later need snapshot semantics (each caller sees a consistent point-in-time copy), you would switch to copying the map on every `getFlags()` call rather than returning a shared view.

---

### Issue 2: View Initialized Before Map Is Populated

**Problem:** In the original code, `publicView = Collections.unmodifiableMap(flags)` runs as a field initializer before the constructor body executes. If any code path calls `getFlags()` between object construction starting and `putAll` completing — or if a subclass or framework reflectively accesses the field — it sees an empty map.

**Fix:** Remove the field-level initializer for `publicView` and move the assignment to the end of the constructor body, after `flags.putAll(initial)`. In the reference solution, `publicView = Collections.unmodifiableMap(flags)` appears on the line immediately after `putAll`.

**Explanation:** Java field initializers run in textual order before the constructor body. So the sequence is: `flags` gets a new empty `HashMap`, then `publicView` wraps that empty map, then the constructor body calls `flags.putAll(initial)`. Because `publicView` delegates to the same `HashMap` object, the entries added by `putAll` are visible through the view — but only after `putAll` finishes. Moving the assignment to after `putAll` makes the intent explicit and prevents any window where the view appears empty to a caller who somehow gets access during construction.

---

### Issue 3: Unsynchronized Access Across Threads

**Problem:** `reload()` writes to `flags` (calling `clear` then `putAll`) while request-handling threads concurrently call `getFlags()` and iterate the map. Without synchronization, a reader thread can observe the map mid-clear — with some entries removed and new entries not yet added — causing incorrect flag evaluations.

**Fix:** Add `synchronized` to both `reload()` and `getFlags()`. In the reference solution both method signatures carry the `synchronized` keyword, so a reload and a read are mutually exclusive on the same monitor.

**Explanation:** `HashMap` is not thread-safe. A concurrent `clear()` and `get()` can produce undefined behavior including `NullPointerException` or returning stale entries due to CPU cache visibility. Making both methods `synchronized` on `this` ensures that the entire `clear` + `putAll` sequence in `reload()` completes before any `getFlags()` caller can proceed, and that the updated map state is flushed to main memory before the lock is released. A higher-throughput alternative is a `ReadWriteLock` — many concurrent readers, one writer at a time — but `synchronized` is correct and easier to reason about for a flag map that reloads infrequently.
