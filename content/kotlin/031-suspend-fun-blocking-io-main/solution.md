## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Blocking IO Inside suspend on Main
// ------------------------------------------------------------------------

import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SettingsStore(private val file: File) {

    // CHANGE 1: Wrap all IO work in withContext(Dispatchers.IO) so the blocking FileOutputStream calls run on the IO thread pool, not Dispatchers.Main.
    suspend fun saveSettings(settings: Map<String, String>) {
        withContext(Dispatchers.IO) {
            val content = settings.entries.joinToString("\n") { "${it.key}=${it.value}" }
            FileOutputStream(file).use { stream ->
                stream.write(content.toByteArray())
            }
        }
    }
}
```

## Explanation

### Issue 1: Blocking IO on Main Thread

**Problem:** When `saveSettings` is called from `viewModelScope.launch {}`, it runs on `Dispatchers.Main` because that is the default dispatcher for `viewModelScope` in an Android `ViewModel`. The `suspend` keyword only allows the function to be paused at suspension points — it does not move execution to a background thread by itself. `FileOutputStream.write` is not a suspension point; it blocks the calling thread directly, which here is the main thread. Users see the UI freeze for up to 2 seconds, and on slower devices the system raises an ANR dialog.

**Fix:** Wrap the entire body of `saveSettings` in `withContext(Dispatchers.IO)`. This replaces the bare function body with a `withContext(Dispatchers.IO) { ... }` block that contains both the string serialization and the `FileOutputStream` open/write/close sequence.

**Explanation:** `withContext` is a true suspension point: it suspends the coroutine on `Dispatchers.Main`, hands the lambda off to a thread from the `Dispatchers.IO` pool, and resumes the coroutine on `Dispatchers.Main` only after the lambda returns. The main thread is free to process frames while the file write is in progress. Without `withContext`, every line inside `saveSettings` — including `FileOutputStream(file)` and `stream.write(...)` — executes inline on whatever thread called `launch`, which is the main thread. A related pitfall: if you move only the `write` call into `withContext` but leave `FileOutputStream(file)` outside, the file-open syscall still blocks the main thread; moving the whole block avoids that half-fix.
