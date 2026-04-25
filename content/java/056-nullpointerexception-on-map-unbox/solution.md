## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Null Unboxing from Map Get
// ------------------------------------------------------------------------

import java.util.Map;

public class InvoiceCalculator {
    private static final int UNIT_PRICE_CENTS = 150;

    public long calculateTotal(Map<String, Integer> counts, String userId) {
        // CHANGE 1: Use getOrDefault to avoid returning null; null Integer auto-unboxed to int throws NPE.
        // CHANGE 2: Defaulting to 0 explicitly documents the intent that absent users have zero events.
        int count = counts.getOrDefault(userId, 0);
        return (long) count * UNIT_PRICE_CENTS;
    }
}
```

## Explanation

### Issue 1: Null Auto-Unboxing on Missing Key

**Problem:** When `userId` is not present in the `counts` map, `counts.get(userId)` returns `null`. The code assigns this `null` to a primitive `int`, which triggers Java's auto-unboxing. Auto-unboxing calls `.intValue()` on a `null` reference, and that throws a `NullPointerException` at runtime. The ETL job fails with a stack trace pointing to the multiplication line, which is misleading because the actual problem is on the line above it.

**Fix:** Replace `counts.get(userId)` with `counts.getOrDefault(userId, 0)`. This returns the mapped `Integer` value when the key exists, or the literal `int` value `0` when it does not, so a `null` is never returned and auto-unboxing never sees a `null` reference.

**Explanation:** `Map.get` is specified to return `null` for missing keys, and Java silently converts that `null Integer` to `int` by calling `.intValue()` on it — there is no compiler warning. The failure is intermittent because most user IDs do appear in the map; only IDs that were never in the batch of billing events are absent. `getOrDefault` was added in Java 8 precisely for this pattern: it performs the null check inside the map implementation and returns a caller-supplied fallback. A related pitfall is using `containsKey` followed by `get` in two calls — that is safe but not atomic and is unnecessary when `getOrDefault` exists.

---

### Issue 2: Implicit Handling of Absent Users

**Problem:** Even after fixing the NPE, the code's behavior for missing user IDs — treating them as having zero events — is not stated anywhere. A future maintainer reading `counts.get(userId)` has no signal that absent keys are expected and intentionally produce a zero total. If billing policy ever changes so that a missing user should raise an error instead of returning zero, there is no obvious place where that decision was made.

**Fix:** The `getOrDefault(userId, 0)` call at the CHANGE 2 site makes the zero-default explicit in the source code. If the policy should instead be to throw on a missing user, the default value `0` is a single token to replace with a thrown exception, making the policy easy to locate and change.

**Explanation:** Relying on `Map.get` returning `null` and then auto-unboxing to get a zero would be undefined behavior (it actually throws), so there was never a working implicit zero-default in the buggy code. By writing `getOrDefault(userId, 0)`, the default is a named, visible choice. If billing policy requires that every user ID passed to `calculateTotal` must exist in the map, the right fix is instead to throw an `IllegalArgumentException` or a domain-specific exception when `counts.get(userId)` is `null`, and `getOrDefault` is simply replaced with a null-check-and-throw pattern. Either way, the policy is explicit in the code rather than hidden inside an accidental crash.
