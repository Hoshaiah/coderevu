## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Uncaught Exception in fire-and-forget launch
// ------------------------------------------------------------------------

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import java.io.IOException

class SyncViewModel : ViewModel() {

    val errorMessage = MutableStateFlow<String?>(null)

    fun triggerSync() {
        // CHANGE 1: Move CoroutineExceptionHandler to the launch builder so it is installed on the root coroutine in the hierarchy; a handler on async has no effect because async exceptions propagate to the parent.
        val handler = CoroutineExceptionHandler { _, throwable ->
            errorMessage.value = throwable.message
        }
        viewModelScope.launch(handler) {
            val deferred = async {
                performSync()
            }
            deferred.await()
        }
    }

    private suspend fun performSync() {
        // CHANGE 2: Added missing java.io.IOException import so the file compiles.
        throw IOException("Network unavailable")
    }
}
```

## Explanation

### Issue 1: Handler Installed on Wrong Coroutine

**Problem:** When `performSync()` throws, the app crashes with an unhandled exception instead of showing the Snackbar. The `CoroutineExceptionHandler` is present, but it never fires.

**Fix:** Move the `CoroutineExceptionHandler` from the `async` builder to the `launch` builder: `viewModelScope.launch(handler)`. Remove the `handler` argument from `async`.

**Explanation:** `CoroutineExceptionHandler` is only consulted on the *root* coroutine of a coroutine hierarchy — the one that has no parent that would handle the exception. `async` is always a child coroutine; when it throws, structured concurrency routes the exception upward to its parent (`launch`), not to any handler attached to `async` itself. The `launch` coroutine is the root here (its parent is `viewModelScope`, which is a `SupervisorJob`), so a handler placed on `launch` is the correct install point. When the handler is on `async` only, the exception escapes to the uncaught handler and crashes the process. A related pitfall: if `async` is a direct child of a `coroutineScope {}` block rather than `launch`, even moving the handler to `launch` would not help — `coroutineScope` re-throws the exception to its caller, so you would need a `supervisorScope` to prevent cancellation propagation.

---

### Issue 2: Missing java.io.IOException Import

**Problem:** The buggy file references `IOException` without importing `java.io.IOException`, so it does not compile at all. This would surface as an `Unresolved reference: IOException` compiler error.

**Fix:** Add `import java.io.IOException` at the top of the file (visible as `// CHANGE 2` in `performSync`).

**Explanation:** Kotlin does not auto-import `java.io` types. Unlike `kotlin.Exception`, `java.io.IOException` requires an explicit import statement. Without it, the compiler cannot resolve the symbol and the build fails before any runtime behavior is relevant. The fix is the single import line; nothing else in the file changes.
