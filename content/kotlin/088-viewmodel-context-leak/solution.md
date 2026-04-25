## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Activity Context Leaked in ViewModel
// ------------------------------------------------------------------------

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

// CHANGE 1: Extend AndroidViewModel instead of ViewModel and accept Application (not Activity) so the ViewModel holds only a non-leaking application-scoped context.
class SearchViewModel(application: Application) : AndroidViewModel(application) {

    private val _results = mutableListOf<String>()

    fun search(query: String) {
        viewModelScope.launch {
            // CHANGE 1: Use getApplication<Application>() to retrieve the Application context; it lives as long as the process so holding it in a ViewModel is safe.
            val label = getApplication<Application>().getString(R.string.result_label)
            // ... perform search and format results using label
            _results.add("$label: $query")
        }
    }
}

// In SearchActivity:
// CHANGE 2: Remove the custom factory entirely; ViewModelProvider recognises AndroidViewModel and supplies the Application automatically via its default factory. val viewModel = ViewModelProvider(this).get(SearchViewModel::class.java)
```

## Explanation

### Issue 1: ViewModel retains Activity context across rotation

**Problem:** On every screen rotation Android destroys and recreates the `SearchActivity`, but `SearchViewModel` survives the recreation because the framework keeps it alive. Because `SearchViewModel` stores a reference to the old `SearchActivity` in `context`, the garbage collector cannot reclaim that Activity. Each rotation adds another unreclaimable `SearchActivity` to the heap, and the Memory Profiler shows growing instances until the OOM killer terminates the app.

**Fix:** Replace `ViewModel` with `AndroidViewModel` as the superclass and change the constructor parameter from `Context` (the Activity) to `Application`. Inside `search()`, call `getApplication<Application>().getString(...)` instead of `context.getString(...)`.

**Explanation:** `AndroidViewModel` is a subclass of `ViewModel` that the framework populates with the `Application` singleton, which is created once for the entire process lifetime. Holding a reference to the `Application` is safe because it is never destroyed while the app runs. The `Activity` context, by contrast, is tied to a single screen instance and is destroyed on rotation; storing it in any object that outlives the `Activity` (like a `ViewModel`) is what creates the leak. A related pitfall: storing `Activity` references in static fields, singletons, or callbacks (e.g., an anonymous `Runnable` posted to a `Handler`) causes the same class of leak — always use the application context or lifecycle-aware holders when the consumer outlives the `Activity`.

---

### Issue 2: Custom factory passes Activity context, defeating the fix

**Problem:** Even after switching to `AndroidViewModel`, the custom `ViewModelProvider.Factory` in `SearchActivity` still instantiates `SearchViewModel(this@SearchActivity)`, so the Activity context leak is re-introduced at construction time. The factory bypasses the framework's own mechanism for injecting the `Application`.

**Fix:** Remove the custom `ViewModelProvider.Factory` entirely and use the no-argument `ViewModelProvider(this)` call. The framework's default factory detects that `SearchViewModel` extends `AndroidViewModel` and automatically passes `application` to the constructor.

**Explanation:** `ViewModelProvider`'s default factory (`SavedStateViewModelFactory` / `NewInstanceFactory`) checks whether the requested class extends `AndroidViewModel` and, if so, reflectively constructs it with the `Application` obtained from `activity.application`. Providing a custom factory that calls `SearchViewModel(this@SearchActivity)` passes the Activity reference regardless of the ViewModel's superclass, so the bug persists. Dropping the custom factory lets the framework supply the correct context with no extra code.
