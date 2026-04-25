## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — NullPointerException in EnumSet Contains
// ------------------------------------------------------------------------

import java.util.EnumSet;
import java.util.Set;
import java.util.Collections;

public class PermissionGuard {

    public enum Role { ADMIN, EDITOR, VIEWER }

    private final Set<Role> grantedRoles;

    public PermissionGuard(Set<Role> grantedRoles) {
        // CHANGE 2: guard against a null argument before any further use to avoid NullPointerException at the copyOf call.
        if (grantedRoles == null) {
            this.grantedRoles = Collections.emptySet();
        // CHANGE 1: EnumSet.copyOf throws IllegalArgumentException on an empty collection; use the empty-safe path instead.
        } else if (grantedRoles.isEmpty()) {
            this.grantedRoles = Collections.emptySet();
        } else {
            this.grantedRoles = EnumSet.copyOf(grantedRoles);
        }
    }

    public boolean hasPermission(Role requiredRole) {
        return grantedRoles.contains(requiredRole);
    }
}
```

## Explanation

### Issue 1: `EnumSet.copyOf` rejects empty collections

**Problem:** When a guest user has no roles, the session produces an empty `Set<Role>`. The constructor passes that empty set to `EnumSet.copyOf`, which immediately throws `IllegalArgumentException: Collection is empty` (not a `NullPointerException` — the team misread the stack trace origin, but the crash is real). Every guest request fails at object construction time.

**Fix:** Before calling `EnumSet.copyOf`, the code now checks `grantedRoles.isEmpty()` and assigns `Collections.emptySet()` instead. The `EnumSet.copyOf` path is only taken when the collection has at least one element.

**Explanation:** `EnumSet.copyOf(Collection<E>)` needs at least one element so it can infer the enum type at runtime — it calls `iterator().next()` internally to get that type token. When the collection is empty there is nothing to inspect, so the JDK throws. `Collections.emptySet()` is a safe, immutable, zero-element set that lets `contains` return `false` for every query, which is exactly the right behaviour for a user who holds no roles. A related pitfall: if you later need a typed empty `EnumSet` (for `addAll` etc.), use `EnumSet.noneOf(Role.class)` instead of `Collections.emptySet()`.

---

### Issue 2: No null guard on the constructor argument

**Problem:** If the session layer ever supplies `null` instead of an empty set (e.g., a code path that returns `null` from the database layer rather than an empty list), `grantedRoles == null` is passed straight into `EnumSet.copyOf`, which throws `NullPointerException` before the empty-check even matters.

**Fix:** A `null` check is added at the top of the constructor body. When `grantedRoles` is `null`, `this.grantedRoles` is assigned `Collections.emptySet()`, identical to the empty-collection treatment.

**Explanation:** Defensive null handling at the boundary where external data enters the object prevents one class of crash entirely, regardless of what callers do. Treating `null` and empty-collection as equivalent here is intentional: both mean "this user holds no roles", so the downstream `hasPermission` behaviour is the same. If you want to distinguish the two cases for logging or auditing, add a log line inside the `null` branch before falling through to `emptySet()`.
