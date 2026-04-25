## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — SupervisorJob Swallows Child Exceptions
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

// CHANGE 1: exceptionHandler is now referenced in the scope so SupervisorJob routes child failures to it instead of silently swallowing them.
val exceptionHandler = CoroutineExceptionHandler { _, throwable ->
    println("Caught: ${throwable.message}")
}

class ProfileViewModel {
    // CHANGE 1: Added exceptionHandler to the scope context — without it, SupervisorJob has nowhere to deliver unhandled child exceptions, so they disappear.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main + exceptionHandler)

    val uiState = mutableListOf<String>()

    fun loadProfile(userId: String) {
        scope.launch {
            // CHANGE 2: Wrapped the suspend call in try/catch inside the coroutine body so that caught exceptions update the UI state; this works now that the handler is in the scope context and the exception is properly propagated.
            try {
                val result = fetchProfile(userId)
                uiState.add(result)
            } catch (e: Exception) {
                uiState.add("Error: ${e.message}")
            }
        }
    }

    private suspend fun fetchProfile(userId: String): String {
        delay(100)
        throw RuntimeException("Network error")
    }

    fun clear() {
        scope.cancel()
    }
}
```

## Explanation

### Issue 1: `CoroutineExceptionHandler` missing from scope context

**Problem:** The `exceptionHandler` is defined but never added to the `CoroutineScope`. When a child coroutine of a `SupervisorJob` throws an unhandled exception, the coroutines runtime looks for a `CoroutineExceptionHandler` in the coroutine's own context chain. If none is found, the exception is swallowed silently on Android (or passed to the thread's `UncaughtExceptionHandler` on JVM, which is why `runBlocking` appeared to work in isolation). The UI stays on the loading spinner forever with no log or crash.

**Fix:** Add `exceptionHandler` to the `CoroutineScope` constructor: `CoroutineScope(SupervisorJob() + Dispatchers.Main + exceptionHandler)`. The `+` operator on `CoroutineContext` merges elements, so the handler is now part of every child coroutine's effective context.

**Explanation:** With a regular `Job`, an unhandled child exception cancels the parent and bubbles upward until something handles it. `SupervisorJob` changes this: each child fails independently and the exception is delivered directly to the `CoroutineExceptionHandler` installed in the scope's context, bypassing any parent-level propagation. Because `CoroutineExceptionHandler` is only consulted when the exception is truly unhandled at the top of the coroutine hierarchy, it must be present in the root scope's context — installing it on the `launch` call alone is not sufficient when `SupervisorJob` is in play. The `runBlocking` test worked because `runBlocking` uses a regular blocking dispatcher that surfaces exceptions differently, masking the missing handler.

---

### Issue 2: `try/catch` inside coroutine body is correct but was effectively unreachable without the handler

**Problem:** The `try/catch` block inside `scope.launch` looks right syntactically, but under `SupervisorJob` the exception escapes the `catch` when the coroutine's context has no handler installed, because the runtime first attempts to route the exception through the context's `CoroutineExceptionHandler` before the `catch` in user code can intercept it for structured-concurrency purposes. The symptom is that `uiState.add("Error: ...")` is never called, so the UI never transitions out of the loading state.

**Fix:** The `try/catch` block itself stays unchanged in the reference solution. Once `exceptionHandler` is added to the scope context (CHANGE 1), the `catch` block executes normally and `uiState.add("Error: ${e.message}")` is reached, updating the UI with the error message.

**Explanation:** A `suspend` function that throws inside a coroutine body does surface through a `try/catch` in the same coroutine — that part of Kotlin coroutines works as expected. The confusion arises because without the handler in context, the exception appears to skip the `catch`; what actually happens is the coroutine completes with a failure and the runtime tries to find a `CoroutineExceptionHandler` and finds none, so the failure is silently discarded before the `catch` in the body has a chance to run from the perspective of the scope. Installing the handler restores normal exception flow so the `catch` block fires correctly.
