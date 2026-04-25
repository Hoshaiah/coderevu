## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — ConcurrentHashMap Check-Then-Act Race
// ------------------------------------------------------------------------

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public class RateLimiter {
    private final int maxRequests;
    private final ConcurrentHashMap<String, AtomicInteger> counts =
            new ConcurrentHashMap<>();

    public RateLimiter(int maxRequests) {
        this.maxRequests = maxRequests;
    }

    // Returns true if the request is allowed, false if rate-limited.
    public boolean allowRequest(String clientId) {
        // CHANGE 2: use computeIfAbsent to atomically get-or-create in a single map operation instead of putIfAbsent + get.
        AtomicInteger counter = counts.computeIfAbsent(clientId, k -> new AtomicInteger(0));
        // CHANGE 1: increment first inside a CAS loop, then check; this makes the check-and-increment a single atomic step so no two threads can both see a count below the limit and both succeed.
        int updated = counter.incrementAndGet();
        if (updated <= maxRequests) {
            return true;
        }
        counter.decrementAndGet();
        return false;
    }
}
```

## Explanation

### Issue 1: Check-then-act race on counter

**Problem:** Under concurrent load, more requests than `maxRequests` are allowed for a single client. For example, if the cap is 10 and the current count is 9, two threads can both read `9 < 10`, both decide to allow the request, and both call `incrementAndGet`, leaving the counter at 11 with two requests approved over the limit.

**Fix:** Replace the `counter.get() < maxRequests` check followed by `counter.incrementAndGet()` with an unconditional `counter.incrementAndGet()` whose return value `updated` is then compared to `maxRequests` with `updated <= maxRequests`. If `updated` exceeds the cap, `counter.decrementAndGet()` rolls it back and the method returns `false`.

**Explanation:** The original code separates the read from the write into two distinct steps with no synchronization between them. `AtomicInteger` guarantees each operation is individually atomic, but it does not make sequences of operations atomic. Two threads reading the same value and both deciding to proceed is a textbook check-then-act race. The fix inverts the order: increment first, then check the result. Because `incrementAndGet` returns the value this thread produced, each thread sees its own unique post-increment value. Only the thread whose increment lands at or below `maxRequests` is allowed through; any thread that pushes the count over the cap decrements it back. One pitfall: under very high contention, the counter can temporarily spike above `maxRequests` before the rollback, so external monitoring of the raw counter value will see transient overshoots — the cap is still enforced at the decision point.

---

### Issue 2: Redundant two-step map initialization

**Problem:** The original code calls `counts.putIfAbsent(clientId, new AtomicInteger(0))` and then immediately calls `counts.get(clientId)` to retrieve the counter. This is two map operations where one would suffice, and it unconditionally allocates a `new AtomicInteger(0)` on every call even when the key already exists.

**Fix:** Replace the `putIfAbsent` + `get` pair with a single `counts.computeIfAbsent(clientId, k -> new AtomicInteger(0))` call, which atomically inserts the value only when absent and returns the current (inserted or pre-existing) mapping in one step.

**Explanation:** `ConcurrentHashMap.computeIfAbsent` holds a lock on the bucket only long enough to check and conditionally insert, and it returns the live value directly, removing the need for a follow-up `get`. The old approach wastes an allocation on every request for an existing client because `new AtomicInteger(0)` is evaluated before `putIfAbsent` is called regardless of whether the key is present. With `computeIfAbsent` and a lambda, the `AtomicInteger` is only constructed when the key is actually absent. This change is a correctness-neutral cleanup on its own, but it makes the code simpler and avoids the tiny window between `putIfAbsent` and `get` where, in theory, another thread could evict the entry (not applicable here since there is no eviction, but the pattern is still fragile in general map usage).
