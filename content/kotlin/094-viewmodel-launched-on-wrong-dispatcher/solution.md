## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — ViewModel IO Work on Main Thread
// ------------------------------------------------------------------------

import androidx.lifecycle.*
import kotlinx.coroutines.*

data class UserProfile(val id: String, val name: String, val posts: List<String>)

class UserProfileViewModel(
    private val userRepository: UserRepository
) : ViewModel() {

    private val _profile = MutableLiveData<UserProfile>()
    val profile: LiveData<UserProfile> = _profile

    fun loadProfile(userId: String) {
        // CHANGE 1: Switch to Dispatchers.IO so the suspend database call runs on a background thread, not the main thread, preventing UI freezes and ANRs.
        viewModelScope.launch(Dispatchers.IO) {
            val profile = userRepository.getProfile(userId)
            // CHANGE 2: Post the result back to the main thread using withContext(Dispatchers.Main) before calling _profile.value, which requires the main thread.
            withContext(Dispatchers.Main) {
                _profile.value = profile
            }
        }
    }
}

interface UserRepository {
    suspend fun getProfile(userId: String): UserProfile
}
```

## Explanation

### Issue 1: Database Query Blocking Main Thread

**Problem:** When `loadProfile` is called, the coroutine launches with `Dispatchers.Main`, meaning every line inside the coroutine body — including `userRepository.getProfile(userId)` — executes on the Android main (UI) thread. Users see the UI freeze for 2-4 seconds while the Room query runs, and on slower devices the ANR dialog appears.

**Fix:** Replace `Dispatchers.Main` with `Dispatchers.IO` in the `viewModelScope.launch(...)` call. This routes the coroutine's initial execution to the I/O thread pool, so the `suspend` database call runs off the main thread entirely.

**Explanation:** Even though `getProfile` is a `suspend` function, `suspend` alone does not move work to a background thread — it only allows the coroutine to be suspended without blocking. The actual thread used is determined by the dispatcher. With `Dispatchers.Main`, the coroutine resumes on the main thread after each suspension point, and if the Room call internally blocks (e.g., waiting for a lock or doing a large sequential scan) it blocks that thread too. `Dispatchers.IO` maintains a pool of threads specifically sized for blocking I/O work, so Room can take as long as it needs without touching the UI thread. A related pitfall: if you leave the dispatcher as `Dispatchers.Main` but remove the explicit argument (relying on `viewModelScope`'s default, which is also `Dispatchers.Main`), the bug persists — you must explicitly opt into `Dispatchers.IO`.

---

### Issue 2: LiveData Value Update Must Happen on Main Thread

**Problem:** After fixing the dispatcher to `Dispatchers.IO`, the coroutine body runs on a background thread. Calling `_profile.value = profile` from a background thread throws an `IllegalStateException` at runtime because `LiveData.setValue` enforces main-thread access.

**Fix:** Wrap `_profile.value = profile` inside a `withContext(Dispatchers.Main) { ... }` block. This suspends the coroutine on the I/O thread, resumes it on the main thread just for the assignment, then returns. The database fetch still runs on `Dispatchers.IO`; only the LiveData update crosses back to main.

**Explanation:** `LiveData.setValue` checks the calling thread via `ArchTaskExecutor` and throws if called off the main thread. `LiveData.postValue` is the thread-safe alternative, but it schedules the update asynchronously, which can cause a race where a rapid series of updates drops intermediate values. Using `withContext(Dispatchers.Main)` is the explicit, predictable way to cross back to the main thread at exactly the right moment without giving up control over ordering. The I/O work completes first, then the result is handed to the main thread in one clean hop — no background-to-main race, no dropped updates.
