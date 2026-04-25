## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Optional Map Lambda Returns Null
// ------------------------------------------------------------------------

import java.util.Optional;

public class ProfileService {

    public static class User {
        final String username;
        final String displayName; // nullable
        User(String username, String displayName) {
            this.username = username;
            this.displayName = displayName;
        }
    }

    private final UserRepository repo;

    public ProfileService(UserRepository repo) {
        this.repo = repo;
    }

    public String getDisplayName(long userId) {
        return repo.findById(userId)
                // CHANGE 1: use flatMap with Optional.ofNullable so a null displayName produces an empty Optional rather than causing NPE inside map
                // CHANGE 2: fall back to the username when displayName is null, then fall back to "Anonymous" when no user exists at all
                .flatMap(u -> Optional.ofNullable(u.displayName).or(() -> Optional.of(u.username)))
                .orElse("Anonymous");
    }

    interface UserRepository {
        Optional<User> findById(long id);
    }
}
```

## Explanation

### Issue 1: `Optional.map` throws NPE on null return

**Problem:** When a user's `displayName` is `null`, the lambda `u -> u.displayName` returns `null` to `Optional.map`. The JDK implementation of `Optional.map` immediately wraps the returned value with `Objects.requireNonNull`, so it throws a `NullPointerException` rather than producing an empty `Optional`. SSO users hit this path on every profile fetch.

**Fix:** Replace `.map(u -> u.displayName)` with `.flatMap(u -> Optional.ofNullable(u.displayName).or(() -> Optional.of(u.username)))`. This is CHANGE 1 and CHANGE 2 together on the same line.

**Explanation:** `Optional.map` is designed to transform a present value, but the JavaDoc explicitly states the mapper must not return `null` — doing so is a contract violation that raises `NullPointerException`. `Optional.flatMap` accepts a function that itself returns an `Optional`, so you control whether the result is present or empty. Wrapping the nullable field with `Optional.ofNullable` converts `null` into `Optional.empty()` safely. The `.or(...)` call (added in Java 9) then supplies the username as a non-null fallback when `displayName` is absent, and the final `.orElse("Anonymous")` handles the case where no `User` row exists at all. A common related pitfall is assuming `orElse` handles nulls inside an `Optional` — it only triggers when the `Optional` itself is empty.

---

### Issue 2: Null displayName fallback silently swallowed by wrong operator

**Problem:** The original code uses `.orElse("Anonymous")` expecting it to catch the null `displayName` case. But `orElse` only activates when the `Optional` is empty (i.e., `Optional.empty()`). A `User` object that exists with a `null` `displayName` produces a present `Optional` after `map` — except `map` crashes first, so the fallback never even runs.

**Fix:** Inside the `flatMap` lambda, `.or(() -> Optional.of(u.username))` provides the username as the display name when `displayName` is `null`, keeping `orElse("Anonymous")` solely for the truly missing-user case. This is CHANGE 2.

**Explanation:** There are two distinct absent-value scenarios here: the user record does not exist at all, and the user record exists but `displayName` is `null`. `orElse` at the end of the chain can only address the first scenario (empty `Optional` from `repo.findById`). The second scenario must be handled earlier in the chain, at the point where the nullable field is accessed. By using `Optional.ofNullable(u.displayName).or(...)` inside `flatMap`, the chain stays empty-`Optional`-based throughout and each fallback level is explicit and independently testable.
