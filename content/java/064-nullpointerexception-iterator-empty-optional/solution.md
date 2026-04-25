## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Optional flatMap Returns Null Silently
// ------------------------------------------------------------------------

import java.util.Optional;

public class UserProfileService {

    private final UserRepository userRepository;

    public UserProfileService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public Optional<String> getShippingCity(long userId) {
        return userRepository.findById(userId)
                // CHANGE 1: Wrap the nullable return of getShippingAddress() with Optional.ofNullable() before passing to flatMap, because flatMap requires the mapper to return a non-null Optional — returning null from the mapper throws NullPointerException.
                .flatMap(user -> Optional.ofNullable(user.getShippingAddress()))
                // CHANGE 2: Use map with getCity() on the now-correctly-typed Optional<Address> pipeline; no other change needed here, but the fix only works because CHANGE 1 makes the element type Address, not Optional<Address>.
                .map(address -> address.getCity());
    }

    // getShippingAddress() returns null when no address is saved,
    // not an empty Optional
    interface User {
        Address getShippingAddress();
    }

    interface Address {
        String getCity();
    }

    interface UserRepository {
        Optional<User> findById(long id);
    }
}
```

## Explanation

### Issue 1: `flatMap` mapper returns null instead of `Optional`

**Problem:** When a user has no saved address, `user.getShippingAddress()` returns `null`. `Optional.flatMap` requires its mapper function to return a non-null `Optional`; if the mapper returns `null`, the JDK throws a `NullPointerException` inside the `Optional` implementation. On the checkout page this surfaces as an unhandled NPE for any user who skipped the address step.

**Fix:** Replace the bare lambda `user -> user.getShippingAddress()` with `user -> Optional.ofNullable(user.getShippingAddress())` at the `flatMap` call site (CHANGE 1). `Optional.ofNullable` converts the potentially-null `Address` into either an `Optional<Address>` containing the address or an empty `Optional`, which is exactly what `flatMap` demands from its mapper.

**Explanation:** `Optional.flatMap` is designed for cases where the mapper already produces an `Optional` — it unwraps one level so you don't end up with `Optional<Optional<T>>`. The contract it enforces is that the mapper must never return `null`; if it does, the JDK source (`Objects.requireNonNull` inside `flatMap`) throws immediately. Here, `getShippingAddress()` returns a raw nullable reference, not an `Optional`, so the mapper hands `null` directly to `flatMap`, triggering the NPE. Wrapping with `Optional.ofNullable` satisfies the contract: a missing address becomes an empty `Optional` and the rest of the pipeline short-circuits cleanly to `Optional.empty()`. A related pitfall: if you used `Optional.of(user.getShippingAddress())` instead of `ofNullable`, you would still get an NPE for the null case — `of` requires a non-null argument.

---

### Issue 2: Interface contract mismatch between declared return type and actual behavior

**Problem:** The `User` interface declares `Address getShippingAddress()` returning a raw `Address`, but the original code passes the result directly to `flatMap` as if it were an `Optional<Address>`. This mismatch is invisible at the call site without reading the interface comment, making the bug easy to reintroduce.

**Fix:** At CHANGE 2 the `.map(address -> address.getCity())` call remains correct, but it only compiles cleanly and behaves correctly because CHANGE 1 has ensured the pipeline element is now a plain `Address` rather than an `Optional<Address>`. No change to the `map` line itself is required, but it is annotated to clarify that the correctness of the pipeline depends on CHANGE 1.

**Explanation:** When `flatMap`'s mapper returns an `Optional<T>`, the outer `Optional` is unwrapped so the next stage sees `T`. If the mapper had been returning a raw `Address` wrapped in `Optional.ofNullable`, the next `.map` correctly receives an `Address` and can call `getCity()` on it. Had the interface been changed to return `Optional<Address>` directly, you could pass the method reference `user::getShippingAddress` to `flatMap` without any wrapping — but since you cannot always change the model, wrapping at the call site with `ofNullable` is the minimal, safe fix. The key discipline here is: whenever you use `flatMap` on an `Optional`, always verify the mapper returns `Optional<T>`, never a raw `T` or null.
