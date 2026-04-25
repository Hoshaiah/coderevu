## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — runBlocking Deadlock on Main Thread
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

class UserRepository(private val api: UserApi) {

    // Called from Activity.onCreate on the main thread
    // CHANGE 1: Expose loadUser as a suspend function so callers use a proper coroutine scope (e.g. lifecycleScope.launch) instead of runBlocking, eliminating the deadlock.
    suspend fun loadUser(userId: String): User {
        return fetchUser(userId)
    }

    // CHANGE 2: Switch from Dispatchers.Main to Dispatchers.IO so the network call runs on a background thread, not the main-thread dispatcher that is already blocked.
    private suspend fun fetchUser(userId: String): User {
        return withContext(Dispatchers.IO) {
            api.getUser(userId)
        }
    }
}

interface UserApi {
    suspend fun getUser(id: String): User
}

data class User(val id: String, val name: String)
```

## Explanation

### Issue 1: `runBlocking` Deadlocks the Main Thread

**Problem:** The app freezes immediately when `loadUser()` is called from `Activity.onCreate`. The main thread blocks inside `runBlocking`, waiting for `fetchUser` to complete. `fetchUser` uses `withContext(Dispatchers.Main)`, which schedules a continuation back onto the main thread. Because the main thread is already blocked by `runBlocking`, that continuation never runs, and both sides wait forever — producing an ANR after 5 seconds.

**Fix:** `loadUser` is changed from a regular `fun` returning `User` to a `suspend fun`. The caller (e.g. the Activity) must launch it inside a coroutine scope like `lifecycleScope.launch { loadUser(id) }`. The `runBlocking` wrapper is removed entirely.

**Explanation:** `runBlocking` parks the calling thread until the coroutine inside it finishes. On desktop JVM, `Dispatchers.Main` typically maps to a generic event loop or the calling thread, so the work can often sneak through. On Android, `Dispatchers.Main` is backed by the Android `Looper` for the main thread — and that Looper is the very thread `runBlocking` has frozen. The coroutine posts a message to the Looper saying "resume here", but the Looper cannot process messages because it's stuck waiting for `runBlocking` to return. Neither side can proceed. Making `loadUser` a suspend function lets the coroutine infrastructure manage suspension cooperatively; the main thread stays free to run its Looper and dispatch continuations as they arrive.

---

### Issue 2: Network Call Dispatched to `Dispatchers.Main`

**Problem:** Even if the deadlock were somehow avoided, `api.getUser(userId)` — a network request — is forced to run on the main thread via `withContext(Dispatchers.Main)`. Android forbids network I/O on the main thread and will throw `NetworkOnMainThreadException`.

**Fix:** `withContext(Dispatchers.Main)` in `fetchUser` is replaced with `withContext(Dispatchers.IO)`, which routes the call to a thread pool designed for blocking I/O operations.

**Explanation:** `Dispatchers.IO` maintains a pool of threads specifically for work that blocks (disk reads, network calls, JDBC queries). `Dispatchers.Main` exists for UI updates — reading a view's size, posting a text change — not for I/O. Using `Dispatchers.IO` here means the network call runs on a background thread, the result is returned to the caller's dispatcher when done, and the main thread stays responsive throughout. A related pitfall: if `api.getUser` is itself already a non-blocking suspend function (e.g. Retrofit with coroutine support), `withContext(Dispatchers.IO)` is still safe and correct — Retrofit will internally switch dispatchers as needed, and the explicit `Dispatchers.IO` context adds no harm while protecting against future implementations that might block.
