## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — String Equality via Reference Comparison
// ------------------------------------------------------------------------

import java.util.List;

public class RoleChecker {

    public boolean hasRole(List<String> userRoles, String requiredRole) {
        for (String role : userRoles) {
            // CHANGE 2: skip null entries to avoid NullPointerException if JWT library returns a list with nulls
            if (role == null) {
                continue;
            }
            // CHANGE 1: use .equals() instead of == so value equality is checked, not object identity
            if (role.equals(requiredRole)) {
                return true;
            }
        }
        return false;
    }
}
```

## Explanation

### Issue 1: Reference vs. Value Equality for Strings

**Problem:** Users with the `ADMIN` role in their JWT are intermittently denied access even though `System.out.println` shows the strings look identical. The `==` operator returns `false` whenever the two `String` objects live at different memory addresses, even if their character contents are identical.

**Fix:** Replace `role == requiredRole` with `role.equals(requiredRole)`. The `.equals()` method on `String` compares the sequence of characters, not the object reference.

**Explanation:** In Java, `==` on objects tests whether both variables point to the exact same object in memory. The JVM interns string literals (things written directly in source code like `"ADMIN"`), so a hardcoded test always passes because both sides end up referencing the same interned object. At runtime, the JWT library constructs role strings by parsing bytes from the token — those strings are `new String(...)` allocations and are not interned, so `==` returns `false` even though the content matches. The behavior is therefore version- and runtime-dependent: some JWT library versions may happen to intern or cache strings, making the bug appear only intermittently. Switching to `.equals()` makes the comparison deterministic and correct regardless of how the `String` object was constructed.

---

### Issue 2: Missing Null Check on List Elements

**Problem:** If the JWT parsing library ever places a `null` entry in the roles list (for example, when a claim value is missing or malformed), calling `role.equals(requiredRole)` throws a `NullPointerException`, crashing the servlet filter and potentially returning a 500 to the client instead of a clean 403.

**Fix:** Add a `if (role == null) { continue; }` guard immediately before the `.equals()` call so null entries are skipped safely.

**Explanation:** `null.equals(anything)` is not valid Java — it throws `NullPointerException` at the dereference. Checking `role == null` (using `==` here is correct because we are explicitly testing for the null reference, not comparing string values) and skipping the entry is the safest approach. An alternative is `requiredRole.equals(role)`, which avoids NPE when `role` is null because `String.equals` handles a null argument by returning `false`; however, that pattern breaks if `requiredRole` itself is null. The explicit null-continue guard makes the intent clear and is robust regardless of what `requiredRole` contains.
