## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Elvis Ignores Java Platform Type
// ------------------------------------------------------------------------

// UserRecord is a Java class with no nullability annotations:
// public class UserRecord {
//     public String getDisplayName() { ... }
//     public String getEmail() { ... }
// }

data class User(val displayName: String, val email: String)

fun mapToUser(record: UserRecord): User {
    val displayName = record.displayName ?: "Anonymous"
    // CHANGE 1: added Elvis fallback so a null platform-type email becomes empty string instead of crashing inside User(...)
    val email = record.email ?: ""

    return User(
        displayName = displayName,
        email = email
    )
}
```

## Explanation

### Issue 1: Unguarded Platform-Type Assignment for `email`

**Problem:** When a `UserRecord` row has a null `email` column, `record.email` returns `null` through Kotlin's platform-type mechanism (`String!`). Kotlin does not insert an automatic null-check at the assignment, so `email` silently holds `null`. The NPE fires later inside the `User(...)` constructor when Kotlin's generated code asserts the non-null parameter contract.

**Fix:** Replace `val email = record.email` with `val email = record.email ?: ""` (the `// CHANGE 1` line). The Elvis operator unwraps the platform type: if `getEmail()` returns `null`, the expression evaluates to the fallback `""` instead, so `email` is always a non-null `String` when it reaches the constructor.

**Explanation:** Kotlin platform types (`String!`) exist because the Java class carries no `@Nullable` or `@NotNull` annotation — Kotlin cannot know the true nullability. Kotlin therefore skips its usual null-safety checks and lets you assign the value to either `String` or `String?`. When you assign to `String` (non-null), Kotlin trusts you and defers its nullability assertion to use-sites like constructors. The deferred assertion is what produces the NPE at the constructor call rather than at the assignment line. Adding `?: ""` forces the null to surface at the assignment line and provides a defined fallback. A related pitfall: the same issue would occur if you passed `record.email` directly as a function argument typed `String` — the crash would appear inside the callee, not at your call site.

---

### Issue 2: False Confidence from Elvis on `displayName`

**Problem:** The team saw `record.displayName ?: "Anonymous"` compile and run without issues, and concluded that the Elvis-on-platform-type pattern was validated as safe. They applied the same mental model to `email` but omitted the Elvis, assuming the assignment itself was safe — it is not.

**Fix:** The `// CHANGE 1` comment directly above the `email` line documents why the Elvis is required here too. No separate code change is needed for `displayName` — it already has the guard — but the fix for `email` closes the gap in the pattern.

**Explanation:** The Elvis on `displayName` works at runtime only because `getDisplayName()` never actually returns `null` in the data being tested. It does not prove that platform types are safe to assign without a guard — it just means the guarded code path (`"Anonymous"`) was never exercised. If `getDisplayName()` ever returned `null`, the Elvis would catch it; but if the Elvis were absent, the same NPE-in-constructor scenario would occur. The lesson is that every platform-type value from an unannotated Java method must be treated as potentially `null` at the Kotlin boundary, regardless of whether existing tests exercise the null path.
