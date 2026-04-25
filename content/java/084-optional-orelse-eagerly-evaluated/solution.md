## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Optional.orElse Eagerly Evaluates Fallback
// ------------------------------------------------------------------------

import java.util.Optional;

public class UserService {
    private final UserCache cache;
    private final UserRepository db;

    public UserService(UserCache cache, UserRepository db) {
        this.cache = cache;
        this.db = db;
    }

    public User getUser(long userId) {
        return cache.get(userId)
                    // CHANGE 1: replaced orElse(db.findById(userId)) with orElseGet(() -> db.findById(userId)) so the DB call is only made when the cache misses, not on every invocation.
                    .orElseGet(() -> db.findById(userId));
    }
}
```

## Explanation

### Issue 1: `orElse` Eager Evaluation of DB Call

**Problem:** Every call to `getUser()` invokes `db.findById(userId)`, even when `cache.get(userId)` returns a non-empty `Optional`. Operators see database connection-pool exhaustion and query latency at 100% of request rate, despite a cache hit rate above 90%.

**Fix:** Replace `.orElse(db.findById(userId))` with `.orElseGet(() -> db.findById(userId))`. The argument is now a `Supplier<User>` lambda instead of a pre-computed value.

**Explanation:** Java evaluates all method arguments before the method body runs. When you write `orElse(db.findById(userId))`, the JVM evaluates `db.findById(userId)` first — producing a `User` object — and then passes that object to `orElse()`. The `Optional` machinery never had a chance to short-circuit the call; the damage is already done. `orElseGet()` takes a `Supplier<T>` instead. The lambda `() -> db.findById(userId)` is an object that wraps the call, and `orElseGet` only invokes `supplier.get()` when the `Optional` is empty. For a 90% cache hit rate this means the database is called for roughly 10% of requests rather than 100%. A related pitfall: the same eager-evaluation trap applies to `orElse(new SomeExpensiveObject())` — any constructor or method call inside `orElse()` runs unconditionally, so default to `orElseGet` whenever the fallback has side effects or real cost.
