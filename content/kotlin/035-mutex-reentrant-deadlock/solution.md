## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Reentrant Mutex Causes Deadlock
// ------------------------------------------------------------------------

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class User(val id: String, val name: String)

class UserStore {
    private val mutex = Mutex()
    private val users = mutableMapOf<String, User>()

    suspend fun getUser(id: String): User? {
        return mutex.withLock {
            users[id]
        }
    }

    suspend fun updateUser(user: User): User? {
        return mutex.withLock {
            users[user.id] = user
            // CHANGE 1: Read directly from the map instead of calling getUser, avoiding a second attempt to acquire the non-reentrant Mutex which would deadlock.
            // CHANGE 2: Inline the map lookup here so no redundant lock acquisition occurs; getUser is still safe to call independently from outside.
            users[user.id]
        }
    }
}
```

## Explanation

### Issue 1: Non-reentrant Mutex causes deadlock

**Problem:** When `updateUser` is called, a coroutine acquires the `Mutex` via `withLock`, then immediately calls `getUser`, which also tries to acquire the same `Mutex`. Because Kotlin's `Mutex` is not reentrant, the second `withLock` in `getUser` suspends indefinitely waiting for a lock the same coroutine already holds. In production this hangs the coroutine permanently, starving the pool.

**Fix:** Remove the `getUser(user.id)` call inside `updateUser`'s locked block and replace it with a direct map lookup `users[user.id]` (the `CHANGE 1` / `CHANGE 2` site). The result is identical — the freshly stored value — but no second lock acquisition happens.

**Explanation:** Kotlin's `Mutex` deliberately has no reentrant support. When a coroutine calls `mutex.withLock { ... }` a second time while the same lock is held, `withLock` calls `mutex.lock()` which suspends the coroutine until the lock is released. The lock is never released because the coroutine is the one holding it and it is now suspended — a circular wait with no resolution. The fix avoids the second `lock()` call entirely by reading `users[user.id]` directly while already inside the locked region. A related pitfall: even extracting the shared read logic into a private non-suspending function (e.g., `private fun getUserUnlocked(id: String) = users[id]`) works and keeps the code DRY, but calling the public `suspend fun getUser` — which re-acquires the lock — will always reproduce the deadlock.

---

### Issue 2: Redundant lock acquisition for a read already inside a locked region

**Problem:** Even ignoring the deadlock, calling `getUser` from inside `updateUser` acquires the lock twice for what is logically one atomic operation. This adds overhead and, more importantly, creates a code structure where the lock scope is obscured — a future reader may not realize that `getUser` also locks.

**Fix:** At the `CHANGE 2` site, `users[user.id]` is used directly inside the `withLock` block instead of delegating to `getUser`. This keeps all map access inside a single locked region with no nesting.

**Explanation:** Once a coroutine is inside `mutex.withLock { ... }`, the map is already exclusively owned by that coroutine for the duration of the block. Reading `users[user.id]` there is safe without any additional synchronization. Routing through `getUser` adds a second lock attempt that is both redundant and — given the non-reentrant `Mutex` — fatal. Keeping public API functions like `getUser` responsible for their own locking is good practice, but it means they must not be called from within another locked section over the same mutex. A clean pattern is to have a private unlocked helper (e.g., `private fun readUser(id: String) = users[id]`) that both `getUser` and `updateUser` call, with each public function wrapping it in its own `withLock`.
