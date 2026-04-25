## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — ViewModel Holds Activity Context Reference
// ------------------------------------------------------------------------

import android.app.Application
import androidx.lifecycle.AndroidViewModel

// CHANGE 1: Replace Activity parameter with Application and extend AndroidViewModel so the ViewModel holds only the Application context, which is never destroyed during configuration changes.
class SearchViewModel(application: Application) : AndroidViewModel(application) {

    val headerText: String
        // CHANGE 1: Use getApplication<Application>() to resolve the string resource instead of the stored Activity reference, eliminating the memory leak.
        get() = getApplication<Application>().getString(R.string.search_header)

    // CHANGE 2: No Activity parameter is accepted here; the ViewModel is now constructable by AndroidViewModelFactory without any custom factory.
    fun search(query: String): List<Result> {
        // ... search logic
        return emptyList()
    }
}
```

## Explanation

### Issue 1: Activity Reference Retained in ViewModel

**Problem:** After a screen rotation, Android creates a new `Activity` instance but keeps the existing `SearchViewModel` alive in the `ViewModelStore`. The old `Activity` is supposed to be garbage-collected, but the ViewModel holds a strong reference to it, so it never is. Each rotation leaks one more `Activity`, and heap usage grows without bound.

**Fix:** Replace `private val activity: Activity` in the constructor with `application: Application`, extend `AndroidViewModel(application)` instead of `ViewModel`, and call `getApplication<Application>().getString(...)` in the `headerText` getter.

**Explanation:** The `ViewModelStore` is scoped to the `ViewModelStoreOwner` (usually the `FragmentActivity`), not to any individual `Activity` instance. When the device rotates, the store — and every `ViewModel` inside it — survives while the old `Activity` is destroyed. Any object the `ViewModel` references strongly will also survive, defeating garbage collection. `Application` is a singleton that lives for the entire process lifetime, so holding a reference to it from a `ViewModel` is safe. `AndroidViewModel` is the standard base class that carries this `Application` reference and exposes it via `getApplication()`. A related pitfall: if you need a `Context` for something other than resource resolution (e.g., starting a service), you still must not pass an `Activity`; use `getApplication()` and be aware that `startActivity` from a non-Activity context requires the `FLAG_ACTIVITY_NEW_TASK` flag.

---

### Issue 2: Constructor Incompatible with AndroidViewModelFactory

**Problem:** The standard `ViewModelProvider` uses `AndroidViewModelFactory` to instantiate `AndroidViewModel` subclasses automatically when the constructor takes exactly one `Application` argument. Accepting an `Activity` instead means the factory cannot create the `ViewModel` without a custom factory, and any developer who tries `ViewModelProvider(this)[SearchViewModel::class.java]` gets a runtime `RuntimeException` about missing constructor.

**Fix:** Remove the `Activity` parameter from the constructor entirely and accept only `application: Application`. This matches the signature that `AndroidViewModelFactory` looks for via reflection.

**Explanation:** `AndroidViewModelFactory.create()` checks whether the requested class is a subclass of `AndroidViewModel` and, if so, calls the constructor with a single `Application` argument using reflection. If the constructor signature does not match — for example because it expects an `Activity` — the factory throws at runtime rather than compile time, which can be a hard-to-trace crash. Switching to the `(application: Application)` signature lets the framework instantiate the `ViewModel` with no boilerplate factory code on the call site. If you genuinely need extra constructor arguments (e.g., a repository), the right approach is a custom `ViewModelProvider.Factory` or a dependency-injection framework, not passing Android framework objects like `Activity`.
