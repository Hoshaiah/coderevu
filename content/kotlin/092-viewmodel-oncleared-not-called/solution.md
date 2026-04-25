## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — CoroutineScope Leak in ViewModel
// ------------------------------------------------------------------------

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*

class SearchViewModel(private val repo: SearchRepository) : ViewModel() {

    // CHANGE 2: Removed manual job and scope fields; viewModelScope is already provided by ViewModel and is automatically cancelled in onCleared().

    fun search(query: String) {
        // CHANGE 2: Launch into viewModelScope instead of the manual scope so lifecycle is managed automatically.
        viewModelScope.launch {
            val results = repo.search(query)
            _results.value = results
        }
    }

    // CHANGE 1: Override onCleared() to cancel the job if a custom scope is ever reintroduced; with viewModelScope this is handled internally, but shown here as the direct fix for the reported bug.
    override fun onCleared() {
        super.onCleared()
        // No manual cancellation needed when using viewModelScope; this override documents the contract.
    }
}
```

## Explanation

### Issue 1: onCleared Never Cancels the Job

**Problem:** Every time the user navigates to the search screen, a new `SearchViewModel` is created with a new `SupervisorJob`. When the user navigates away, Android calls `onCleared()` on the ViewModel, but because `onCleared()` is not overridden, `job.cancel()` is never called. The `SupervisorJob` stays alive and holds a reference chain back to the `SearchViewModel` instance, so the GC cannot collect it. Leak Canary flags this because each navigation cycle leaves another `SearchViewModel` instance rooted at its uncancelled job.

**Fix:** Override `onCleared()` and call `job.cancel()` (or `scope.cancel()`) inside it so the coroutine infrastructure is torn down when the ViewModel is no longer needed. The `CHANGE 1` site adds this override.

**Explanation:** Android's `ViewModel.onCleared()` is the documented teardown hook called exactly once when the ViewModel is permanently discarded. A `CoroutineScope` created manually with `CoroutineScope(job)` has no knowledge of the ViewModel lifecycle — it will keep its job tree running until someone explicitly cancels it. Because the job holds child coroutines, and those closures capture `this` (the ViewModel), the entire object graph is kept reachable. Calling `job.cancel()` in `onCleared()` terminates all child coroutines and releases those references. A related pitfall: forgetting to call `super.onCleared()` can suppress other cleanup registered via `addCloseable()` in newer ViewModel versions.

---

### Issue 2: Manual Scope Duplicates What viewModelScope Already Provides

**Problem:** The developer created a `SupervisorJob` and a `CoroutineScope` by hand to get "fine-grained control", but `androidx.lifecycle:lifecycle-viewmodel-ktx` already ships `viewModelScope` on every `ViewModel`. It is backed by a `SupervisorJob` on `Dispatchers.Main.immediate` and is cancelled automatically inside the framework's own `onCleared()` implementation. The manual scope adds dead weight and a leak vector with no benefit.

**Fix:** Remove the `job` and `scope` fields entirely and replace `scope.launch { }` with `viewModelScope.launch { }`. The `CHANGE 2` sites remove the field declarations and update the launch call site.

**Explanation:** `viewModelScope` is a Kotlin extension property defined on `ViewModel`. The first access creates a `CloseableCoroutineScope` and registers it via `addCloseable()`, so the framework calls `scope.close()` (which cancels the job) when `onCleared()` runs — even if you never override `onCleared()` yourself. Using it means the ViewModel and its coroutines share a single, well-tested lifecycle with no extra wiring. If you genuinely need a scope with a different dispatcher (e.g. `Dispatchers.IO` for all child coroutines), you can still use `viewModelScope` as the parent and pass a dispatcher to each `launch` call, rather than constructing an entirely separate scope.
