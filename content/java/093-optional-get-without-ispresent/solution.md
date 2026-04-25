## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Calling Optional.get() without a presence check throws NoSuchElementException in production
// ------------------------------------------------------------------------
import java.util.Optional;

public class UserProfileService {

    private final UserRepository repo;

    public UserProfileService(UserRepository repo) {
        this.repo = repo;
    }

    public String getDisplayName(String email) {
        Optional<User> user = repo.findByEmail(email);
        // CHANGE 1: replaced unconditional user.get() with orElseThrow() so that a missing user produces a clear, typed exception instead of the opaque NoSuchElementException that Optional.get() throws on an empty value.
        // CHANGE 2: the lambda supplies an IllegalArgumentException with a message that names the email, giving callers and logs actionable business context.
        return user.orElseThrow(() -> new IllegalArgumentException(
                "No user found for email: " + email))
                .getDisplayName();
    }
}
```

## Explanation

### Issue 1: `Optional.get()` called without presence check

**Problem:** When `repo.findByEmail(email)` cannot find a matching user it returns an empty `Optional`. The next line immediately calls `user.get()` on that empty `Optional`, which throws `java.util.NoSuchElementException: No value present`. In production this surfaces as a 500 error with a stack trace that points into the JDK rather than the application code.

**Fix:** Replace `user.get().getDisplayName()` with `user.orElseThrow(...).getDisplayName()`. `orElseThrow` is a single method that atomically checks for a value and either returns it or throws the exception you supply.

**Explanation:** `Optional.get()` was designed for cases where you have already verified the value is present, but nothing in the original code does that verification. Every path through `getDisplayName` calls `get()` unconditionally, so any empty `Optional` blows up. `orElseThrow` makes the check-and-extract a single step, eliminating the window between a separate `isPresent()` call and the `get()` call where another thread or refactor could break the invariant. A related pitfall: using `orElse(null)` silences the exception but shifts the failure to a `NullPointerException` one line later, which is equally unhelpful.

---

### Issue 2: Missing business-context exception message

**Problem:** Even if the code were changed to throw on a missing user, a raw `NoSuchElementException` with the message "No value present" tells the caller and the on-call engineer nothing about which email was looked up or what business rule was violated. Log aggregation tools show hundreds of identical stack traces with no distinguishing information.

**Fix:** Pass a lambda to `orElseThrow` that constructs `new IllegalArgumentException("No user found for email: " + email)`. This attaches the offending email address to the exception message and uses an exception type that signals bad input rather than an internal JDK state error.

**Explanation:** `IllegalArgumentException` communicates that the problem is with the value the caller provided, which is the correct semantic here — an unregistered email is invalid input to this service. Including the `email` value in the message means that every log entry for this failure path contains the data needed to reproduce or investigate the issue without additional queries or debugging sessions. If the email address is considered sensitive, the message can be replaced with a stable error code, but the structure of a typed, informative exception should be preserved regardless.
