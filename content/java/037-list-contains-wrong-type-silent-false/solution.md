## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — contains() on Wrong Type Returns False
// ------------------------------------------------------------------------

import java.util.List;

public class RoleChecker {
    private final List<Integer> allowedRoles;

    public RoleChecker(List<Integer> allowedRoles) {
        this.allowedRoles = allowedRoles;
    }

    public boolean hasRole(long roleId) {
        // roleId comes from JWT library as a long primitive
        // CHANGE 1: Cast roleId to Integer explicitly so contains() compares Integer-to-Integer; passing a long causes autoboxing to Long, which is never equal to any Integer in the list.
        // CHANGE 2: Guard against out-of-range values before casting; a roleId outside int range would silently truncate to a wrong ID, potentially granting or denying access incorrectly.
        if (roleId < Integer.MIN_VALUE || roleId > Integer.MAX_VALUE) {
            return false;
        }
        return allowedRoles.contains((int) roleId);
    }
}
```

## Explanation

### Issue 1: `long` Autoboxed to `Long`, Not `Integer`

**Problem:** `allowedRoles.contains(roleId)` always returns `false` even when the role ID value is present in the list. Users who should be denied pass through the filter because the filter treats `false` as "no match found" and falls through to a permissive default.

**Fix:** Replace `allowedRoles.contains(roleId)` with `allowedRoles.contains((int) roleId)`. The cast to `int` causes autoboxing to `Integer`, which correctly matches the `Integer` objects stored in the list.

**Explanation:** Java's `List.contains()` uses `equals()` to compare objects. When you pass a `long` primitive to `contains()`, the compiler autoboxes it to a `Long` object. `Long.equals(Integer)` always returns `false` because they are different types — `equals()` checks `instanceof` first. The list holds `Integer` objects, so no `Long` will ever match. Casting the `long` to `int` before the call makes the autoboxing produce an `Integer`, which `equals()` correctly matches against the list elements. A related pitfall: if you change the list type to `List<Long>` as an alternative fix, you must also update every call site and the constructor signature, making the cast the smaller, safer change here.

---

### Issue 2: Silent Truncation on Out-of-Range `long` Values

**Problem:** If the JWT library produces a `roleId` larger than `Integer.MAX_VALUE` (2,147,483,647) or smaller than `Integer.MIN_VALUE`, casting it directly to `int` silently truncates the high bits and produces a completely different integer value. This could accidentally match a valid role ID, granting access to a user who should be denied.

**Fix:** Add a range check `if (roleId < Integer.MIN_VALUE || roleId > Integer.MAX_VALUE) { return false; }` before the cast. This is the guard added at the CHANGE 2 site.

**Explanation:** Java's narrowing primitive conversion from `long` to `int` keeps only the low 32 bits and discards the rest. For example, `(int) 2147483648L` yields `-2147483648`, which is `Integer.MIN_VALUE` — a completely different number that could coincidentally match a real role. Because JWT payloads are attacker-controlled data, an adversary could craft a `roleId` that, after truncation, matches a privileged role they do not hold. The range guard ensures such values are rejected outright before the cast ever executes.
