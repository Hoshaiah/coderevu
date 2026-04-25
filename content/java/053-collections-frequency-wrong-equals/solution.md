## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Collections.frequency Uses Wrong equals
// ------------------------------------------------------------------------

import java.util.Collections;
import java.util.List;
import java.util.Objects;

public class AuditChecker {

    public static class AuditEvent {
        public final String userId;
        public final String action;

        public AuditEvent(String userId, String action) {
            this.userId = userId;
            this.action = action;
        }

        @Override
        public String toString() {
            return userId + ":" + action;
        }

        // CHANGE 1: Override equals so two AuditEvent instances with the same fields are considered equal; without this, Collections.frequency uses Object.equals (identity) and always returns 0 for a freshly constructed target.
        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof AuditEvent)) return false;
            AuditEvent that = (AuditEvent) o;
            return Objects.equals(userId, that.userId) && Objects.equals(action, that.action);
        }

        // CHANGE 2: Override hashCode consistently with equals so that AuditEvent works correctly in hash-based collections (HashMap, HashSet) and upholds the equals/hashCode contract.
        @Override
        public int hashCode() {
            return Objects.hash(userId, action);
        }
    }

    public int countOccurrences(List<AuditEvent> events, String userId, String action) {
        AuditEvent target = new AuditEvent(userId, action);
        return Collections.frequency(events, target);
    }
}
```

## Explanation

### Issue 1: Missing `equals` override causes identity comparison

**Problem:** Every call to `countOccurrences` returns 0, even when the list contains events with identical `userId` and `action` values. `List.contains` also returns `false` for a target built with the same field values, which is the junior dev's clue.

**Fix:** Add an `equals` override on `AuditEvent` (the `// CHANGE 1` site) that compares `userId` and `action` with `Objects.equals`, replacing the inherited `Object.equals` identity check.

**Explanation:** `Collections.frequency` counts elements where `target.equals(element)` returns `true`. When `equals` is not overridden, Java falls back to `Object.equals`, which returns `true` only if the two references point to the exact same object. Because `countOccurrences` always constructs a fresh `AuditEvent` with `new`, it will never be the same object as any element in the list, so the count is always 0. Overriding `equals` to compare field values means two separate instances that carry the same `userId` and `action` are treated as equal, and `Collections.frequency` counts them correctly. A related pitfall: if the fields themselves are mutable, changing them after insertion into a hash-based collection can corrupt the collection's internal state.

---

### Issue 2: `equals` override without matching `hashCode` violates the contract

**Problem:** If only `equals` is fixed and `hashCode` is left as the default identity-based hash, `AuditEvent` objects that are equal under `equals` produce different hash codes. This makes the class silently broken in `HashMap`, `HashSet`, and any structure that buckets by hash before comparing equality.

**Fix:** Add a `hashCode` override at the `// CHANGE 2` site using `Objects.hash(userId, action)`, mirroring exactly the fields used in `equals`.

**Explanation:** Java's contract states: if `a.equals(b)` is `true`, then `a.hashCode()` must equal `b.hashCode()`. The default `Object.hashCode` is typically derived from object identity (memory address), so two distinct instances with equal fields produce different hashes. A `HashMap` lookup starts by computing the hash to find the right bucket; if the hash is wrong, the map never even reaches the `equals` check, so `map.get(target)` returns `null` even though a matching key exists. The fix here does not affect the `List`-based `Collections.frequency` call directly (lists do not hash), but it is required for correctness if `AuditEvent` is ever stored in a `HashSet` or used as a map key, and it fulfills the language contract.
