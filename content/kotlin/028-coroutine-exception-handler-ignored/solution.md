## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — CoroutineExceptionHandler on async Ignored
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class PaymentProcessor {

    private val handler = CoroutineExceptionHandler { _, throwable ->
        println("Payment validation error: $throwable")
    }

    suspend fun validatePayment(cardNumber: String, amount: Double): Boolean {
        // CHANGE 1: Removed handler from async() calls — CoroutineExceptionHandler is never invoked by async; async always rethrows through the structured-concurrency Job tree. The try/catch around coroutineScope is the correct place to handle the exception and already returns false on failure.
        return try {
            coroutineScope {
                val cardCheck = async { checkCard(cardNumber) }
                val fraudCheck = async { checkFraud(cardNumber, amount) }
                cardCheck.await() && fraudCheck.await()
            }
        } catch (e: Exception) {
            // CHANGE 2: Log the exception here, mirroring what the handler was supposed to do, since the handler callback will never fire for async-based coroutines inside coroutineScope.
            println("Payment validation error: $e")
            false
        }
    }

    private suspend fun checkCard(cardNumber: String): Boolean = TODO()
    private suspend fun checkFraud(card: String, amount: Double): Boolean = TODO()
}
```

## Explanation

### Issue 1: `CoroutineExceptionHandler` ignored by `async`

**Problem:** When either `checkCard` or `checkFraud` throws, the app crashes with an unhandled exception. The `CoroutineExceptionHandler` callback (`println("Payment validation error: ...")`) is never called, so the team sees no log output before the crash.

**Fix:** Remove `handler` from both `async(handler) { ... }` call sites (CHANGE 1). Handle and log the exception inside the existing `catch (e: Exception)` block (CHANGE 2) by adding a `println` that replicates the handler's intended logging.

**Explanation:** `CoroutineExceptionHandler` only activates for coroutines that are *root* coroutines — ones whose `Job` has no parent — or for `launch` coroutines where the exception cannot be propagated further up the hierarchy. `async` is designed to capture an exception inside its `Deferred` and rethrow it when `await()` is called; it never invokes the handler. Inside `coroutineScope`, both `async` coroutines are children of the scope's `Job`, so any unhandled exception propagates upward through structured concurrency and surfaces at the `coroutineScope { }` call site. The `try/catch` wrapping `coroutineScope` already intercepts it there. The fix therefore removes the misleading `handler` argument and moves the log statement into the `catch` block, which is the only code path that actually executes when the child coroutines fail.

---

### Issue 2: Handler attached to wrong coroutine level

**Problem:** Even if `CoroutineExceptionHandler` could fire for `async` in some contexts, attaching it to the individual `async` child coroutines rather than the scope that owns them would still have no effect. The handler needs to be on the root or supervisor-scope level to intercept uncaught exceptions.

**Fix:** The `async(handler) { ... }` arguments are removed (CHANGE 1). If a top-level handler is needed in a different part of the codebase (e.g., with `SupervisorScope` + `launch`), the handler belongs on the `CoroutineScope` constructor or on the `launch` call at the root level, not on `async` children.

**Explanation:** The Kotlin coroutines runtime walks up the `Job` parent chain looking for a `CoroutineExceptionHandler` only after an exception is considered "unhandled" — meaning there is no parent job left to propagate it to. Inside `coroutineScope`, the parent job always exists, so the walk never reaches a point where the handler is consulted. Attaching the handler to an `async` child that lives inside a `coroutineScope` therefore has zero effect regardless of where on the child it is placed. A related pitfall: even with `supervisorScope`, `async` still does not invoke the handler — you would need `launch` under a supervisor for the handler to fire automatically.
