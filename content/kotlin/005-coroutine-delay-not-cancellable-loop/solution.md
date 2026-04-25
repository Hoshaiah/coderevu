## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Blocking Sleep Inside Coroutine Loop
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class JobPoller(private val scope: CoroutineScope) {

    fun start() {
        scope.launch {
            while (isActive) {
                try {
                    fetchAndProcessJobs()
                } catch (e: CancellationException) {
                    // CHANGE 2: Re-throw CancellationException so the coroutine machinery can honour cancellation; catching it in the broad Exception handler was silently swallowing the signal.
                    throw e
                } catch (e: Exception) {
                    println("Error processing jobs: ${e.message}")
                }
                // CHANGE 1: Replace Thread.sleep() with delay() so the suspension point is cancellation-aware; Thread.sleep() blocks the thread entirely and does not check for coroutine cancellation.
                delay(5_000)
            }
        }
    }

    private suspend fun fetchAndProcessJobs() {
        // ... network call and processing
        println("Jobs processed")
    }
}
```

## Explanation

### Issue 1: Blocking Sleep Ignores Cancellation

**Problem:** The coroutine uses `Thread.sleep(5_000)` to wait between polls. When the `CoroutineScope` is cancelled, the coroutine cannot stop while `Thread.sleep` is executing because that call holds the thread in a blocking sleep and never checks the coroutine's cancellation flag. Operators see the worker stay alive for up to 5 seconds per iteration — and potentially much longer if the sleep is called repeatedly before the loop condition is re-evaluated.

**Fix:** Replace `Thread.sleep(5_000)` with `delay(5_000)` (the `kotlinx.coroutines` suspend function) at the CHANGE 1 site.

**Explanation:** Coroutine cancellation in Kotlin is cooperative: the coroutine must reach a *suspension point* or explicitly call `isActive`/`ensureActive()` for the cancellation to take effect. `Thread.sleep()` is a plain Java blocking call that parks the OS thread with no knowledge of the coroutine framework — it will not wake early just because the scope was cancelled. `delay()`, by contrast, is a suspending function that registers a cancellable timer; when the scope is cancelled, `delay()` immediately throws `CancellationException`, unwinding the coroutine cleanly. A related pitfall: any other blocking I/O call (e.g. a synchronous `OkHttp` call without a timeout) has the same problem — always prefer suspending or non-blocking alternatives inside coroutines.

---

### Issue 2: Broad Exception Catch Swallows CancellationException

**Problem:** The `catch (e: Exception)` block catches every `Exception` subclass, which includes `CancellationException`. When the coroutine framework throws `CancellationException` to signal cancellation (for example, from inside `delay()` or any other suspension point), this handler silently swallows it and prints an error message instead of letting the exception propagate. The loop then continues as if nothing happened.

**Fix:** Add a separate `catch (e: CancellationException)` block above the general `Exception` handler at the CHANGE 2 site that immediately re-throws the exception, ensuring the cancellation signal is not consumed.

**Explanation:** Kotlin's coroutine cancellation mechanism works by throwing `CancellationException` at the next suspension point. The framework expects this exception to propagate up through the call stack so it can mark the coroutine as cancelled and clean up. When a `catch (e: Exception)` block intercepts it first, the coroutine thinks an ordinary error occurred, logs it, and keeps looping — the cancellation is lost. Re-throwing `CancellationException` (or catching only non-cancellation exceptions) lets the exception travel up to the coroutine builder (`launch`), which then completes the coroutine in the cancelled state. A common alternative is to call `ensureActive()` at the top of the loop body, which will throw `CancellationException` itself if the scope is already cancelled, giving you a second line of defence even if the exception was swallowed somewhere deeper.
