## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — String Identity vs Equality Check
// ------------------------------------------------------------------------

public class RoleChecker {

    public boolean isAdmin(String role) {
        // Check if the user has the ADMIN role
        // CHANGE 1: Use .equals() instead of == to compare String values, not object references; DB strings are new heap objects and will never be == to the literal "ADMIN"
        // CHANGE 2: Call equals() on the literal so that a null role returns false instead of throwing NullPointerException
        if ("ADMIN".equals(role)) {
            return true;
        }
        return false;
    }

    public boolean hasRole(String role, String required) {
        // CHANGE 1: Replace == with .equals() so content equality is checked, not reference identity
        // CHANGE 2: Guard against null by delegating to Objects.equals which handles null safely for both arguments
        return java.util.Objects.equals(role, required);
    }
}
```

## Explanation

### Issue 1: Reference Equality Instead of Value Equality

**Problem:** Every user whose role comes from a database `ResultSet` is denied admin access even though the database contains the string `ADMIN`. The `==` operator returns `false` for these users, so `isAdmin()` always returns `false` for DB-sourced roles.

**Fix:** Replace `role == "ADMIN"` with `"ADMIN".equals(role)` in `isAdmin()`, and replace `role == required` with `java.util.Objects.equals(role, required)` in `hasRole()`.

**Explanation:** In Java, `==` on objects tests whether two variables point to the exact same object in memory, not whether they hold the same characters. The JVM interns string literals at compile time, so two uses of `"ADMIN"` in source code share one object, and `==` happens to work between literals. A `String` constructed at runtime — such as one read from a JDBC `ResultSet` — is a new heap object with a different address, so `== "ADMIN"` evaluates to `false` even when the content is byte-for-byte identical. `String.equals()` compares the actual character sequences and always gives the correct result regardless of where the string was created. Calling `equals()` on the literal (`"ADMIN".equals(role)`) rather than on the variable is a defensive habit that sets up the null-safety fix described next.

---

### Issue 2: No Null Guard on the `role` Parameter

**Problem:** If the database column is `NULL` for a user, `ResultSet.getString()` returns `null`, and the call `role == "ADMIN"` silently returns `false` (no crash) but switching to `role.equals("ADMIN")` would throw a `NullPointerException`, crashing the servlet filter and potentially exposing an error page instead of a proper 403.

**Fix:** In `isAdmin()`, invert the receiver so the call is `"ADMIN".equals(role)` — a null `role` argument makes `equals()` return `false` safely. In `hasRole()`, use `java.util.Objects.equals(role, required)`, which handles null for both arguments.

**Explanation:** `String.equals()` internally checks whether the argument is null and returns `false` if so. By placing the known-non-null literal `"ADMIN"` as the receiver, a null `role` becomes a safe argument rather than a null dereference. `Objects.equals(a, b)` applies the same principle to `hasRole()` where neither parameter is a known-non-null literal — it returns `true` only if both are null or if `a.equals(b)` returns `true`, covering every combination without risk of NPE. A related pitfall: never use `role.equalsIgnoreCase("ADMIN")` as the sole fix, because that still throws if `role` is null.
