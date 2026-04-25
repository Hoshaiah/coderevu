## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — String.format Null Argument NPE
// ------------------------------------------------------------------------

public class EmailFormatter {

    public String formatSubject(UserAccount account) {
        String displayName = account.getDisplayName();
        String userId = account.getUserId();
        // CHANGE 1: Guard against null displayName before calling toUpperCase() to avoid NullPointerException; fall back to empty string so the batch job does not abort.
        String upperName = (displayName != null) ? displayName.toUpperCase() : "";
        // CHANGE 2: Replace null userId with the string "GUEST" so the formatted subject is meaningful rather than showing the literal word 'null'.
        String displayUserId = (userId != null) ? userId : "GUEST";
        return String.format("Hello %s (ID: %s), you have new messages!",
                upperName, displayUserId);
    }

    static class UserAccount {
        private final String displayName;
        private final String userId; // may be null for guest accounts

        UserAccount(String displayName, String userId) {
            this.displayName = displayName;
            this.userId = userId;
        }

        String getDisplayName() { return displayName; }
        String getUserId() { return userId; }
    }
}
```

## Explanation

### Issue 1: NullPointerException on displayName.toUpperCase()

**Problem:** When `account.getDisplayName()` returns `null` (which the class does not prevent), the call `displayName.toUpperCase()` throws a `NullPointerException`. In a batch job processing thousands of accounts, this crashes the entire run for all remaining accounts once a single account has a null display name.

**Fix:** A ternary guard is added before the `String.format` call: `String upperName = (displayName != null) ? displayName.toUpperCase() : "";`. The `String.format` line then uses `upperName` instead of `displayName.toUpperCase()`.

**Explanation:** Java instance method calls on a `null` reference always throw `NullPointerException` at runtime. There is no compile-time warning because the type is `String`, not a primitive. The fix materialises the null-checked result into a local variable before passing it to `String.format`. Using an empty string as the fallback keeps the formatted output valid. A related pitfall: `String.format("%s", nullRef)` does *not* throw — `%s` converts `null` to the four-character string `"null"` — so the NPE here comes solely from the `.toUpperCase()` call, not from `String.format` itself.

---

### Issue 2: Null userId Rendered as Literal String 'null'

**Problem:** When `account.getUserId()` returns `null`, `String.format` with `%s` converts it to the text `"null"` and the outgoing email reads `Hello ALICE (ID: null), you have new messages!`. Recipients see that raw word, which looks like a software defect.

**Fix:** A ternary expression `String displayUserId = (userId != null) ? userId : "GUEST";` is introduced, and `displayUserId` is passed to `String.format` in place of the raw `userId`.

**Explanation:** `String.format` calls `String.valueOf(arg)` internally for `%s` conversions, and `String.valueOf(null)` returns the four-character string `"null"` rather than throwing. This means the code compiles and runs without error, but the output is misleading to end users. Swapping in a meaningful fallback like `"GUEST"` matches the domain concept documented in the `UserAccount` field comment. A broader pattern to keep in mind: any `%s` slot receiving a potentially-null value will silently produce `"null"` in the output, so every nullable argument to `String.format` deserves an explicit fallback.
