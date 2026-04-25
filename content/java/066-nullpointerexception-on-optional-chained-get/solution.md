## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Null Return Inside Optional Map Chain
// ------------------------------------------------------------------------

import java.util.Optional;

public class UserService {
    private final UserProfileRepository profileRepository;

    public UserService(UserProfileRepository profileRepository) {
        this.profileRepository = profileRepository;
    }

    public Optional<String> getDisplayName(long userId) {
        return profileRepository.findById(userId)
                // CHANGE 1: Use flatMap with Optional.ofNullable so a null displayName produces an empty Optional instead of Optional[null], preventing NPE on later terminal operations.
                .flatMap(profile -> Optional.ofNullable(profile.getDisplayName()));
    }
}
```

## Explanation

### Issue 1: `Optional.map` Wraps Null, Causing NPE

**Problem:** When `profile.getDisplayName()` returns `null`, `Optional.map` wraps that `null` into an `Optional` that is technically non-empty but holds a `null` value. Any subsequent terminal operation — such as `get()`, `orElseThrow()`, or passing the value to a method that expects a non-null `String` — throws a `NullPointerException`. The stack trace points inside the pipeline because the NPE fires when the `null` value is actually used, not where it was introduced.

**Fix:** Replace `.map(profile -> profile.getDisplayName())` with `.flatMap(profile -> Optional.ofNullable(profile.getDisplayName()))`. `Optional.ofNullable` converts the potentially-null `String` into a proper `Optional<String>` (empty when null, present when non-null), and `flatMap` flattens the resulting `Optional<Optional<String>>` back to `Optional<String>`.

**Explanation:** `Optional.map` is defined to apply the function and wrap the result, with one exception: if the `Optional` itself is empty it skips the function. It does *not* treat a null return from the function as "empty" — it stores the null inside the `Optional`. So `Optional.of(profile).map(p -> null)` gives you an `Optional` where `isPresent()` returns `true` but `get()` returns `null`. That violates the contract most callers assume. `flatMap` expects the mapper to return an `Optional` directly, so by returning `Optional.ofNullable(displayName)` you let the standard `Optional` semantics handle the null-means-absent case. A related pitfall: `Optional.of(null)` throws immediately, while `Optional.ofNullable(null)` returns `Optional.empty()` — always prefer `ofNullable` when the value might legitimately be null.

---
