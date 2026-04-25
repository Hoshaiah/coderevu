## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Race Between containsKey and put
// ------------------------------------------------------------------------

import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;

public class TokenRegistry {
    // Key = token, Value = unused marker
    private final ConcurrentHashMap<String, Boolean> usedTokens = new ConcurrentHashMap<>();

    public boolean consume(String token) {
        // CHANGE 1+2: Replace non-atomic containsKey+put pair with a single atomic putIfAbsent call; returns null only when the key was absent (first use), which means this thread successfully consumed the token.
        Boolean previous = usedTokens.putIfAbsent(token, Boolean.TRUE);
        return previous == null; // null means token was not present before → consumed successfully
    }

    public int usedCount() {
        return usedTokens.size();
    }
}
```

## Explanation

### Issue 1: TOCTOU Race Allows Double Consumption

**Problem:** Two threads calling `consume()` with the same token at the same time can both execute `containsKey(token)` and see `false` before either has called `put()`. Both then proceed to call `put()` and both return `true`, meaning the same token is accepted twice — defeating the replay-attack prevention entirely.

**Fix:** Remove the `containsKey` + `put` pair and replace it with a single `putIfAbsent(token, Boolean.TRUE)` call (CHANGE 1+2). The return value is `null` when the key was freshly inserted, so `return previous == null` correctly signals first use.

**Explanation:** Even though `ConcurrentHashMap` makes each individual method call thread-safe, it does not make sequences of calls atomic. Between the moment thread A reads "key absent" from `containsKey` and the moment it writes via `put`, thread B can complete the same read-then-write sequence. `putIfAbsent` is a single atomic compare-and-set operation inside the map: only one thread wins the insertion and gets `null` back; all others get the previously stored value. This closes the window entirely. A related pitfall: using `synchronized` on the whole method would also work but would serialize all token lookups, killing throughput under load. `putIfAbsent` gives correctness with fine-grained locking.

---

### Issue 2: ConcurrentHashMap Atomicity Guarantee Not Leveraged

**Problem:** The code uses `ConcurrentHashMap` as if its thread-safety means any sequence of calls on it is also thread-safe. It is not — each call is individually atomic, but the *check-then-act* pattern still produces a race. The developer gets a false sense of security from choosing a concurrent collection.

**Fix:** Use `putIfAbsent` (CHANGE 1+2), which is the atomic conditional-insert method that `ConcurrentHashMap` exposes specifically for this pattern. The `containsKey` call is deleted entirely.

**Explanation:** `ConcurrentHashMap` documents several atomic compound operations — `putIfAbsent`, `replace`, `computeIfAbsent` — precisely because the map's designers knew that callers would need check-then-act semantics without external locking. Using `putIfAbsent` means the map internally holds a segment lock (or uses CAS in Java 8+) for the duration of the check and the insert together. Callers that do not use these methods and instead chain plain reads and writes are bypassing the safety that the map was designed to provide. When you need "insert only if absent", always reach for `putIfAbsent` or `computeIfAbsent` rather than rolling your own check.
