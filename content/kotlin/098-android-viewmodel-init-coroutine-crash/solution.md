## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — ViewModel Init Coroutine Leaks on Error
// ------------------------------------------------------------------------

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class DashboardStats(val totalUsers: Int, val revenue: Double)

// CHANGE 2: Added a sealed Result wrapper so the UI can observe success, error, and loading states instead of a bare nullable value.
sealed class StatsResult {
    object Loading : StatsResult()
    data class Success(val stats: DashboardStats) : StatsResult()
    data class Error(val message: String) : StatsResult()
}

class DashboardViewModel(private val repository: StatsRepository) : ViewModel() {

    // CHANGE 2: StateFlow now carries StatsResult instead of nullable DashboardStats, starting in Loading state so the UI has an initial value to render.
    private val _stats = MutableStateFlow<StatsResult>(StatsResult.Loading)
    val stats: StateFlow<StatsResult> = _stats

    // CHANGE 1: Added a CoroutineExceptionHandler so any uncaught exception thrown inside the coroutine is caught here instead of crashing the process via the uncaught exception handler.
    private val exceptionHandler = CoroutineExceptionHandler { _, throwable ->
        _stats.value = StatsResult.Error(throwable.message ?: "Unknown error")
    }

    init {
        // CHANGE 1: Pass exceptionHandler to launch so exceptions from repository.fetchStats() are routed to it rather than propagating to the uncaught exception handler.
        viewModelScope.launch(exceptionHandler) {
            // CHANGE 3: Wrapped the repository call in try/catch as a second safety net to handle exceptions that may surface after the coroutine's dispatcher switches context, and to emit an Error state with a meaningful message instead of leaving _stats as Loading forever.
            try {
                val result = repository.fetchStats()
                _stats.value = StatsResult.Success(result)
            } catch (e: Exception) {
                _stats.value = StatsResult.Error(e.message ?: "Failed to load stats")
            }
        }
    }
}

interface StatsRepository {
    suspend fun fetchStats(): DashboardStats
}
```

## Explanation

### Issue 1: Unhandled coroutine exception crashes the app

**Problem:** When `repository.fetchStats()` throws any exception (e.g., a `NullPointerException`, network error, or missing `SavedStateHandle` in tests), the exception escapes the coroutine and reaches the process-level uncaught exception handler. On Android this terminates the app. Crashlytics reports it as a startup crash because the `init` block fires immediately.

**Fix:** A `CoroutineExceptionHandler` named `exceptionHandler` is created and passed as the context argument to `viewModelScope.launch(exceptionHandler)`. When an exception propagates out of the coroutine body, the handler intercepts it and writes an `Error` state to `_stats` instead of letting it reach the uncaught handler.

**Explanation:** `viewModelScope` uses a `SupervisorJob`, which means child coroutine failures do not cancel sibling coroutines — but they still propagate upward to the scope's exception handler. If no `CoroutineExceptionHandler` is installed, Kotlin's coroutine machinery falls back to the thread's uncaught exception handler, which on Android calls `Thread.getDefaultUncaughtExceptionHandler()` and typically crashes. Installing a `CoroutineExceptionHandler` short-circuits that path. Note: the handler only fires for exceptions that are not caught inside the coroutine body itself, so the `try/catch` inside the launch body (CHANGE 3) is still useful as a more granular first line of defense.

---

### Issue 2: No error or loading state exposed to the UI

**Problem:** The original `StateFlow<DashboardStats?>` starts as `null` and only ever moves to a non-null value on success. If the fetch fails the flow stays `null` permanently. The UI cannot distinguish "still loading" from "failed" from "no data", so it either shows nothing or shows stale content indefinitely.

**Fix:** The `StatsResult` sealed class is introduced with three states — `Loading`, `Success`, and `Error`. `_stats` is changed to `MutableStateFlow<StatsResult>(StatsResult.Loading)` and each branch of the coroutine sets the appropriate subtype. The UI can now `when`-switch on the collected value and render the correct state.

**Explanation:** A `StateFlow` must always have a value, and `null` is a valid emission, but it carries no semantic meaning about why the data is absent. A sealed class makes the three distinct states explicit and exhaustive. Starting in `Loading` is important: the collector immediately gets a value on subscription, which prevents the UI from briefly rendering an empty screen before the coroutine even starts. An alternative approach is `Result<DashboardStats>` from the Kotlin standard library, but a custom sealed class makes `Loading` representable, which `Result` does not support without wrapping.

---

### Issue 3: Exception after context switch leaves state stuck in Loading

**Problem:** Even with a `CoroutineExceptionHandler`, exceptions thrown on a background dispatcher (e.g., inside a `withContext(Dispatchers.IO)` block inside `fetchStats`) can sometimes bypass the handler depending on how the repository is structured. If they are not caught, `_stats` stays in `StatsResult.Loading` forever and the user sees an infinite spinner.

**Fix:** A `try/catch` block wraps the `repository.fetchStats()` call inside the coroutine body. On any caught `Exception`, `_stats.value` is set to `StatsResult.Error(e.message ?: "Failed to load stats")`, guaranteeing the state always transitions out of `Loading`.

**Explanation:** The `CoroutineExceptionHandler` catches exceptions that escape the coroutine's entire call tree, but an explicit `try/catch` inside the coroutine body catches them earlier and gives you access to the exception at the exact call site. Having both layers means that even if a future refactor removes one of them, the other still prevents the crash or the stuck-loading state. One pitfall: catching bare `Exception` also catches `CancellationException`, which would interfere with coroutine cancellation. To avoid this, you can either catch a more specific type or re-throw `CancellationException` explicitly inside the catch block if you need to handle it separately.
