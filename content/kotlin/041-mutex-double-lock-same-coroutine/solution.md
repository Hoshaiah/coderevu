## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Mutex Lock Causes Coroutine Deadlock
// ------------------------------------------------------------------------

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class InventoryService {
    private val mutex = Mutex()
    private val stock = mutableMapOf<String, Int>()

    suspend fun reserveStock(productId: String, quantity: Int): Boolean {
        return mutex.withLock {
            // CHANGE 1: call the private unlocked helper instead of the public `isAvailable` which re-acquires the mutex, causing a deadlock on the non-reentrant Mutex.
            if (isAvailableUnlocked(productId, quantity)) {
                stock[productId] = (stock[productId] ?: 0) - quantity
                true
            } else {
                false
            }
        }
    }

    // CHANGE 2: extracted private unlocked helper that performs the check without acquiring the mutex, safe to call only while the caller already holds the lock.
    private fun isAvailableUnlocked(productId: String, quantity: Int): Boolean {
        return (stock[productId] ?: 0) >= quantity
    }

    suspend fun isAvailable(productId: String, quantity: Int): Boolean {
        return mutex.withLock {
            // CHANGE 2: delegate to the private unlocked helper so the public API is still safe for external callers while avoiding double-lock inside reserveStock.
            isAvailableUnlocked(productId, quantity)
        }
    }

    suspend fun getStock(productId: String): Int {
        return mutex.withLock {
            stock[productId] ?: 0
        }
    }
}
```

## Explanation

### Issue 1: Reentrant mutex deadlock on same coroutine

**Problem:** The service hangs permanently under concurrent load. All coroutines that call `reserveStock` for the same product become suspended on `mutex.lock()` and never resume. The process shows 100% CPU on one core from the coroutine scheduler spinning, and no checkout requests complete.

**Fix:** Replace the call to `isAvailable(productId, quantity)` inside `reserveStock` with a call to the new private `isAvailableUnlocked(productId, quantity)` helper (`CHANGE 1`). This helper is a plain `fun` (not `suspend`) that reads the map directly without touching the mutex.

**Explanation:** Kotlin's `Mutex` is not reentrant. When `reserveStock` calls `mutex.withLock { ... }`, the mutex is owned by that coroutine. Inside that block, it calls `isAvailable`, which immediately tries `mutex.withLock { ... }` again on the same mutex. Because the mutex is already locked and no other coroutine can release it (the same coroutine is blocked waiting for itself), the coroutine suspends indefinitely. Every subsequent call to `reserveStock` also tries to acquire the lock and queues up behind it. The lock is never released because the coroutine that holds it is suspended waiting for it — a self-deadlock. The fix is to never call a mutex-acquiring function from within a mutex-guarded block. Instead, extract the logic into a non-locking private helper and call that from inside the `withLock` block. A related pitfall: even if Kotlin added reentrant mutexes, calling `isAvailable` externally would still create a TOCTOU race — the check-then-act window between `isAvailable` and the stock update would not be atomic.

---

### Issue 2: Public API exposes unsynchronized check-then-act race

**Problem:** Any external caller that calls `isAvailable` and then acts on the result (e.g., adds the item to a cart, then calls `reserveStock`) operates on a potentially stale answer. Between the two calls the mutex is released and another coroutine can reduce the stock to zero, so the availability check is no longer valid when the reservation is made.

**Fix:** Extract a `private fun isAvailableUnlocked` that contains the bare map read (`CHANGE 2`), then have both the public `isAvailable` (which wraps it in `mutex.withLock`) and the internal call inside `reserveStock` delegate to this helper. The public method is still individually safe; the internal use is now deadlock-free.

**Explanation:** The original `isAvailable` is `suspend fun` and acquires the mutex itself, which is correct for stand-alone external use but wrong when called from within an already-locked region. By separating the synchronization concern (the `withLock` wrapper in the public method) from the logic concern (the map read in the private helper), both use-cases are served safely. The public `isAvailable` can still be called by, say, a UI layer to display availability, and it will get a consistent snapshot. Internally, `reserveStock` calls `isAvailableUnlocked` while already holding the lock, so the check and the stock decrement are one atomic operation with no window for another coroutine to interleave. A concrete pitfall to watch: if you later add other internal helpers that call `isAvailable` rather than `isAvailableUnlocked`, the deadlock will silently reappear, so treat the unlocked helper as the canonical internal API.
