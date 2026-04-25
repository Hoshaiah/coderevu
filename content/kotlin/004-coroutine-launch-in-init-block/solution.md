## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Coroutine Launched in Init Block
// ------------------------------------------------------------------------

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class HomeViewModel(
    private val feedRepository: FeedRepository
) : ViewModel() {

    private val _feed = MutableStateFlow<List<FeedItem>>(emptyList())
    val feed: StateFlow<List<FeedItem>> = _feed

    // CHANGE 2: Add a separate StateFlow to surface errors so callers can react to failures instead of silently seeing empty data.
    private val _error = MutableStateFlow<Throwable?>(null)
    val error: StateFlow<Throwable?> = _error

    init {
        // CHANGE 1: Replace GlobalScope.launch with viewModelScope.launch so the coroutine is bound to the ViewModel lifecycle and uses the correct Main dispatcher in tests.
        viewModelScope.launch {
            try {
                _feed.value = feedRepository.loadFeed()
            } catch (e: Exception) {
                // CHANGE 2: Emit the exception into _error instead of ignoring it, so the UI can show an error message and logs can surface the failure.
                _error.value = e
            }
        }
    }
}
```

## Explanation

### Issue 1: GlobalScope Leaks Coroutine, Breaks Tests

**Problem:** Every `HomeViewModelTest` that instantiates `HomeViewModel` throws `java.lang.IllegalStateException: Module with the Main dispatcher had failed to initialize`. In production the coroutine keeps running after the screen is left, because it is not tied to any lifecycle.

**Fix:** Remove the `GlobalScope.launch` call and replace it with `viewModelScope.launch`. The `GlobalScope` import is also deleted since it is no longer referenced.

**Explanation:** `GlobalScope` is a process-wide scope with no dispatcher override; it defaults to `Dispatchers.Default` for the coroutine itself but any `withContext(Dispatchers.Main)` call inside (or inside the repository) still needs the Main dispatcher to be initialized. In unit tests that dispatcher is not set up unless you explicitly install a test dispatcher, so the launch crashes immediately. `viewModelScope` is backed by `SupervisorJob() + Dispatchers.Main.immediate`, and lifecycle-viewmodel-ktx provides a test-friendly override path via `Dispatchers.setMain` in your test setup. Beyond tests, `GlobalScope` coroutines outlive the `ViewModel`: if the user navigates away and the `ViewModel` is cleared, the fetch continues, may write to `_feed` on a dead object, and holds references that prevent garbage collection.

---

### Issue 2: Exceptions Silently Discarded

**Problem:** When `feedRepository.loadFeed()` throws — network error, parse failure, anything — the catch block does nothing. The UI sees an empty list and has no way to distinguish "loaded zero items" from "failed to load". There is nothing in logcat either.

**Fix:** A new `MutableStateFlow<Throwable?> _error` is added alongside `_feed`, exposed as `val error: StateFlow<Throwable?>`. Inside the catch block, `_error.value = e` replaces the empty comment.

**Explanation:** Swallowing exceptions in a coroutine is especially dangerous because coroutine failures do not propagate to any thread's uncaught-exception handler by default when you use `launch` (as opposed to `async`). The failure disappears completely. By emitting the exception into a `StateFlow`, the UI layer can collect `error` and display a message or retry button. If you prefer a sealed state class (e.g. `Loading`, `Success`, `Error`), that is a straightforward next step, but the minimal fix here is a dedicated error flow so that at least something observable changes when a failure occurs.
