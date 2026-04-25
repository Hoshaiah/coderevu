## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — withTimeout Cancels Parent Scope
// ------------------------------------------------------------------------

import kotlinx.coroutines.*

data class UserProfile(val id: String, val name: String)

class ProfileService(
    private val api: ProfileApi,
    private val cache: ProfileCache
) {
    suspend fun fetchProfile(userId: String): UserProfile {
        // CHANGE 1: Wrap withTimeout in a coroutineScope so TimeoutCancellationException is confined to this child scope and does not propagate to the parent scope as a CancellationException.
        val timedResult: UserProfile? = try {
            coroutineScope {
                withTimeout(2_000L) {
                    api.getProfile(userId)
                }
            }
        } catch (e: TimeoutCancellationException) {
            null
        }

        if (timedResult != null) return timedResult

        // CHANGE 2: Wrap the cache fallback in its own withTimeout so a slow cache implementation cannot block the caller indefinitely.
        return withTimeout(500L) {
            cache.getLastKnownProfile(userId)
                ?: UserProfile(userId, "Unknown")
        }
    }
}
```

## Explanation

### Issue 1: `TimeoutCancellationException` Cancels Parent Scope

**Problem:** When `withTimeout` fires, it throws `TimeoutCancellationException`. Because this is a subclass of `CancellationException`, the Kotlin coroutines runtime treats it as a signal to cancel the entire coroutine hierarchy. The `try/catch` in the original code catches it locally, but before the catch runs, the cancellation has already propagated to the calling coroutine (the `viewModelScope.launch` block), killing all sibling coroutines — analytics, background syncs, everything.

**Fix:** Wrap `withTimeout` inside a `coroutineScope { }` call. The `TimeoutCancellationException` is now scoped to that child scope and caught there; it never reaches the parent scope.

**Explanation:** `CancellationException` is special in Kotlin coroutines: when an unhandled `CancellationException` escapes a coroutine body, the runtime interprets it as a request to cancel the parent. A `try/catch` at the call site catches the exception value, but the structured concurrency mechanism has already marked the parent job as cancelled before the catch block runs. Wrapping the timeout block in `coroutineScope` creates a new child `Job`. When `TimeoutCancellationException` is thrown inside that child scope, it cancels only the child job. The parent scope sees the child job complete (exceptionally), and the `catch` block handles the exception normally without touching the parent. One related pitfall: `supervisorScope` also works here, but `coroutineScope` is the right choice when you want any other exception from `api.getProfile` to still propagate upward.

---

### Issue 2: Cache Fallback Has No Timeout

**Problem:** If `api.getProfile` times out, execution falls through to `cache.getLastKnownProfile`. If that cache implementation hits a slow disk or a network-backed cache, it can suspend for an unbounded amount of time, blocking the calling coroutine long after the 2-second deadline the team intended.

**Fix:** Wrap the cache call in its own `withTimeout(500L)` block so the fallback path has an explicit upper bound before returning the default `UserProfile`.

**Explanation:** The original code assumes the cache is fast, but `cache.getLastKnownProfile` is a `suspend` function, meaning it can do anything asynchronous. Without a timeout, the total latency of `fetchProfile` is unbounded even though the API call is guarded. Adding a short `withTimeout` on the fallback keeps the function's worst-case duration predictable. Note that this second `withTimeout` is called directly (not inside a `coroutineScope`), which is intentional: if the cache itself times out, you likely do want that exception to propagate, because returning a stale default `UserProfile` after the cache also fails is the right behavior only when the cache throws or returns null — not when it hangs forever.
