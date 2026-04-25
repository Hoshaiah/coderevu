## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — withContext Catches CancellationException Silently
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class UserRepository(private val api: UserApi) {

    suspend fun fetchUser(id: String): Result<User> {
        return try {
            val user = withContext(Dispatchers.IO) {
                api.getUser(id)
            }
            Result.success(user)
        // CHANGE 1: Re-throw CancellationException before the generic catch so cancellation propagates correctly instead of being swallowed as a Result.failure.
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

## Explanation

### Issue 1: CancellationException Swallowed by Generic Catch

**Problem:** When the user navigates away, `viewModelScope` is cancelled. The `withContext(Dispatchers.IO)` block receives the cancellation and throws `CancellationException` back into the `try` block. The bare `catch (e: Exception)` handler intercepts it — because `CancellationException` is a subtype of `Exception` — and converts it into `Result.failure(e)`. The function returns normally, the caller sees a failure result rather than a thrown exception, and the loading state is never cleared.

**Fix:** A new `catch (e: CancellationException)` block is added immediately before the generic `catch (e: Exception)` block. Inside it, the exception is re-thrown with `throw e`. This is the `// CHANGE 1` site.

**Explanation:** Kotlin's structured concurrency relies on `CancellationException` propagating up the call stack unimpeded. When a scope is cancelled, every child coroutine receives a `CancellationException`. If any code in the call chain catches and discards it, the coroutine appears to complete successfully from the parent's perspective — the job stays in a completing state that never resolves, and any UI tied to that job (like a spinner) hangs. Because `CancellationException` extends `IllegalStateException` which extends `Exception`, a plain `catch (e: Exception)` always matches it. The fix ensures the exception escapes the function and reaches the coroutine machinery that handles scope cancellation. A related pitfall: `runCatching { }` has the same problem — it also catches `CancellationException` — so prefer explicit try/catch with the re-throw pattern in suspend functions.

---

### Issue 2: Loading State Never Clears on Navigation

**Problem:** Because `CancellationException` is caught and `Result.failure` is returned, the ViewModel's `onCleared` cancels the scope but the in-flight coroutine returns a value anyway. The ViewModel or UI observer receives `Result.failure` and may show an error state, but more commonly the observer is already torn down, so no state update fires at all and the spinner remains on screen until the process dies.

**Fix:** The same `// CHANGE 1` re-throw ensures the coroutine throws rather than returns, so the parent scope correctly marks the job as cancelled and any `invokeOnCompletion` or `collect`/`observe` teardown logic runs as expected.

**Explanation:** When a coroutine throws `CancellationException`, the coroutine framework marks the `Job` as `Cancelled` and notifies all completion handlers. If instead the coroutine returns normally (even with a failure value), the `Job` transitions to `Completed`, not `Cancelled`. Code in the ViewModel that checks `isActive` or listens for cancellation via `invokeOnCompletion` with a cancellation check will behave differently in these two states. Observers that are lifecycle-aware stop receiving updates when the lifecycle owner is destroyed, so the `Result.failure` update is silently dropped and the loading spinner has no chance to be dismissed. Re-throwing `CancellationException` restores the correct `Job` lifecycle transition and lets the framework clean up properly.
