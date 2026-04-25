## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Mutex Unlock Skipped on Exception
// ------------------------------------------------------------------------

import kotlinx.coroutines.sync.Mutex

data class StockUpdate(val productId: String, val delta: Int)

class InventoryManager {
    private val mutex = Mutex()
    private val stock = mutableMapOf<String, Int>()

    suspend fun applyUpdate(update: StockUpdate) {
        mutex.lock()
        // CHANGE 1 & 2: Wrap the entire critical section in try/finally so mutex.unlock() is always called, even when an exception is thrown.
        try {
            val current = stock[update.productId] ?: 0
            if (current + update.delta < 0) {
                throw IllegalStateException("Insufficient stock for ${update.productId}")
            }
            stock[update.productId] = current + update.delta
        } finally {
            mutex.unlock()
        }
    }
}
```

## Explanation

### Issue 1: Mutex Never Unlocked on Exception

**Problem:** When `applyUpdate` throws `IllegalStateException` (because stock would go negative), execution jumps out of the function before reaching `mutex.unlock()`. The `Mutex` stays locked forever. Every subsequent call to `applyUpdate` blocks on `mutex.lock()` indefinitely, and the service hangs until it is restarted.

**Fix:** The body after `mutex.lock()` is wrapped in a `try/finally` block. `mutex.unlock()` is moved into the `finally` clause, so it executes regardless of whether the `try` body completes normally or throws.

**Explanation:** `Mutex.lock()` marks the mutex as owned by the current coroutine. The only way to release it is to call `mutex.unlock()`. In the original code, the `throw` on the validation failure exits the function via the exception path, bypassing the `unlock()` call that comes after the write. The `finally` block runs unconditionally — whether the `try` exits normally, via `return`, or via any `Throwable` — making it the correct place for cleanup like lock release. A related pitfall: `kotlinx.coroutines.sync.Mutex` also provides a `withLock` extension that performs this `lock`/`try-finally`/`unlock` pattern automatically, which is worth using when the whole function body is the critical section.

---

### Issue 2: No Defensive Structure Against Future Exception Paths

**Problem:** Even after fixing the explicit `throw`, the critical section has no structural guarantee that the lock is released on any unexpected exception. If a future code change adds another operation inside the section that can throw (e.g., a network call, a null dereference), the mutex leaks again without any compile-time or lint warning.

**Fix:** The `try/finally` structure introduced at CHANGE 2 is not just a point fix for the stock-check throw — it encloses the entire critical section so that `mutex.unlock()` in `finally` is the single, authoritative unlock site for all exit paths from the section.

**Explanation:** A lock must be treated like a resource that requires deterministic cleanup, the same way a file handle or database connection does. Placing `unlock()` sequentially after the protected code only works when there is a guarantee that no exception will ever occur between `lock()` and that line. That guarantee is impossible to maintain as code evolves. The `try/finally` idiom makes the cleanup structural: the compiler ensures `finally` always runs, so the correctness of the lock lifecycle does not depend on every future developer remembering to handle every exception. Using `mutex.withLock { ... }` achieves the same result with even less room for error.
