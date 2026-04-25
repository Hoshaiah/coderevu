## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — SavedStateHandle Wrong Type Crash
// ------------------------------------------------------------------------

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

class ProductDetailViewModel(
    savedStateHandle: SavedStateHandle,
    private val repository: ProductRepository
) : ViewModel() {

    // CHANGE 1: Use get<Number> and convert with toLong() so that both Integer (API <= 28) and Long (API 28+) are handled without ClassCastException.
    // CHANGE 2: Replace !! with requireNotNull() so a missing argument throws IllegalStateException with a descriptive message instead of a bare NPE.
    private val productId: Long = requireNotNull(savedStateHandle.get<Number>("productId")) {
        "productId is required in SavedStateHandle but was not found"
    }.toLong()

    init {
        viewModelScope.launch {
            repository.loadProduct(productId)
        }
    }
}
```

## Explanation

### Issue 1: SavedStateHandle Integer/Long Type Mismatch

**Problem:** On Android 8 (API 26) and below, the Parcel serialization layer restores numeric navigation arguments as `Integer` rather than `Long`, even when the navigation graph declares the argument as `Long`. When `savedStateHandle["productId"]` is immediately cast to `Long` via the reified inline operator, the JVM throws `ClassCastException: java.lang.Integer cannot be cast to java.lang.Long` the moment the ViewModel is created.

**Fix:** Replace `savedStateHandle["productId"]!!` with `savedStateHandle.get<Number>("productId")`, then call `.toLong()` on the result. `Number` is a common supertype of both `Integer` and `Long`, so the cast always succeeds regardless of what the platform put in the bundle.

**Explanation:** The Jetpack Navigation Safe Args plugin generates code that writes a `Long` into the bundle on the sending side, but old versions of the Android Parcel implementation read it back as an `Integer` when the value fits in 32 bits. The reified `get<T>()` operator on `SavedStateHandle` performs an unchecked cast to `T`, so asking for `Long` directly triggers the crash. Asking for `Number` instead defers the numeric conversion to Kotlin's `Number.toLong()`, which works whether the underlying object is `Integer`, `Long`, or any other `Number` subtype. If the product ID ever exceeds `Int.MAX_VALUE` (2,147,483,647), the `Integer` path would silently overflow, so calling `toLong()` after retrieval — rather than casting — is also the numerically safe path.

---

### Issue 2: Force-Unwrap Gives Unhelpful NullPointerException

**Problem:** `savedStateHandle["productId"]!!` throws a plain `NullPointerException` with no message if the key is absent. This happens when the ViewModel is instantiated without the expected navigation argument — for example, during a process death/restore flow where the back-stack argument was not properly saved, or a deep-link that omits the parameter.

**Fix:** Replace `!!` with `requireNotNull(...) { "productId is required in SavedStateHandle but was not found" }`. This throws `IllegalStateException` with the provided message instead of a silent NPE.

**Explanation:** Kotlin's `!!` operator throws `NullPointerException` with no contextual information, making crash reports in the field hard to diagnose — the stack trace points at the ViewModel constructor but does not say which value was null or why. `requireNotNull()` throws `IllegalStateException` whose message you control, so crash-reporting tools (Crashlytics, etc.) immediately surface the argument name and the fact that it was missing. The failure mode is identical in severity, but the diagnostic information is dramatically better. A related pitfall: if you later add a second optional `SavedStateHandle` argument and use `!!` on that too, you still get an undifferentiated NPE and no way to tell which argument was the culprit.
