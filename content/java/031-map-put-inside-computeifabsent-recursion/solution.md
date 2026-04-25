## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — ConcurrentHashMap Recursive computeIfAbsent
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DependencyGraph {
    // CHANGE 2: replaced ConcurrentHashMap with HashMap — single-threaded use needs no concurrent map, and HashMap does not restrict recursive modification during computeIfAbsent.
    private final Map<String, List<String>> adjacency = new HashMap<>();

    public List<String> addNode(String node, List<String> knownDependants) {
        // CHANGE 1: moved the pre-registration of dependants outside the computeIfAbsent lambda so the mapping function never mutates the map it is computing into, eliminating the recursive-modification bug.
        for (String dep : knownDependants) {
            adjacency.putIfAbsent(dep, new ArrayList<>());
        }
        return adjacency.computeIfAbsent(node, k -> new ArrayList<>());
    }

    public List<String> getDependants(String node) {
        return adjacency.getOrDefault(node, List.of());
    }
}
```

## Explanation

### Issue 1: Recursive map mutation inside computeIfAbsent

**Problem:** `addNode` calls `adjacency.put()` from inside the mapping function passed to `adjacency.computeIfAbsent()`. On Java 8 this causes `computeIfAbsent` to return `null` instead of the newly created list. On Java 9+ it throws `IllegalStateException` or `ConcurrentModificationException`, even with a single thread.

**Fix:** The loop that calls `adjacency.putIfAbsent(dep, ...)` is moved to execute *before* the `computeIfAbsent` call (CHANGE 1), so the mapping function contains only `return new ArrayList<>()` and never touches the map.

**Explanation:** `ConcurrentHashMap.computeIfAbsent` locks the hash bin for the key being computed and then invokes the mapping function while that lock is held. If the mapping function calls `put` on the same map and the new key hashes to the *same bin*, the thread deadlocks or the internal bookkeeping detects the recursive entry and returns `null` (Java 8) or throws (Java 9+). Even when the keys land in different bins, the Java specification for `ConcurrentHashMap` explicitly states that the mapping function must not modify the map. Moving the dependant pre-registration before `computeIfAbsent` satisfies that contract: all the `putIfAbsent` calls complete first, then `computeIfAbsent` runs with no nested mutation. A related pitfall is doing the same with `compute` or `merge` — all three methods carry the same restriction on `ConcurrentHashMap`.

---

### Issue 2: Using ConcurrentHashMap for single-threaded access

**Problem:** The graph is populated by a single thread at startup, so `ConcurrentHashMap` provides no correctness benefit here. It does, however, enforce the recursive-modification restriction that triggers the bug above, and it adds cache-line padding and striped-lock overhead for every read and write.

**Fix:** Replace `new ConcurrentHashMap<>()` with `new HashMap<>()` (CHANGE 2). `HashMap.computeIfAbsent` does not lock bins and does not throw when the mapping function modifies the map (though the fix in CHANGE 1 still keeps the mutation outside the lambda for clarity).

**Explanation:** `HashMap` is the right default for single-threaded contexts. Its `computeIfAbsent` tracks a `modCount` to detect structural changes, but it does not prohibit them outright the way `ConcurrentHashMap` does — so even before CHANGE 1, using `HashMap` would have avoided the null-return and exception symptoms on most JVM versions. Choosing `ConcurrentHashMap` defensively when no thread-safety is needed is a common pattern that can mask incorrect assumptions; if concurrent access becomes a requirement later, the correct approach is explicit synchronisation or a read-write lock, not silently relying on `ConcurrentHashMap`'s internal locking.
