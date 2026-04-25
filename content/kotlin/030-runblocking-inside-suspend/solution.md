## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — runBlocking Inside suspend Function
// ------------------------------------------------------------------------

import kotlinx.coroutines.*
import java.util.concurrent.Executors

class ImageProcessor(private val cache: PixelCache) {

    private val singleThread = Executors.newSingleThreadExecutor().asCoroutineDispatcher()

    // CHANGE 1: Removed runBlocking entirely; directly call the suspending function. Because loadPixels is already a suspend function, it can await cache.getOrLoad without blocking any thread.
    suspend fun loadPixels(imageId: String): IntArray {
        return cache.getOrLoad(imageId)  // suspending function — no runBlocking needed
    }

    // CHANGE 2: withContext still pins execution to singleThread for ordering, but now the coroutine suspends (not blocks) while waiting for cache, so the thread is free to run other work.
    suspend fun process(imageId: String): ProcessedImage {
        val pixels = withContext(singleThread) {
            loadPixels(imageId)
        }
        return doProcess(pixels)
    }
}
```

## Explanation

### Issue 1: runBlocking Deadlocks Single-Threaded Dispatcher

**Problem:** The production pipeline uses a single-threaded `Executor` dispatcher. When a cache miss occurs, `loadPixels` calls `runBlocking`, which parks the one available thread waiting for `cache.getOrLoad` to finish. But `cache.getOrLoad` is a coroutine that needs to be dispatched — and the only thread it can use is already parked inside `runBlocking`. Neither side can proceed, so processing hangs forever.

**Fix:** Remove `runBlocking` from `loadPixels`. Because `loadPixels` is already a `suspend` function, replace the entire `runBlocking { cache.getOrLoad(imageId) }` block with a direct call `cache.getOrLoad(imageId)`.

**Explanation:** `runBlocking` creates a brand-new event loop and blocks the calling thread until every coroutine inside it finishes. When the dispatcher has only one thread, blocking that thread means no other coroutine can resume on it. `suspend` functions do not block threads — they yield the thread back to the dispatcher when they need to wait, which is exactly what allows single-threaded dispatchers to work. Calling a `suspend` function directly from another `suspend` function is the correct pattern; the suspension chain propagates upward without occupying any thread. A related pitfall: `runBlocking` on a multi-threaded dispatcher (like `Dispatchers.IO`) avoids the deadlock only because another free thread can service the inner coroutine — the code is still wrong in principle and will break under thread exhaustion.

---

### Issue 2: suspend Marker on a Blocking Function Is Misleading

**Problem:** `loadPixels` is declared `suspend` but its body calls `runBlocking`, which means it actually blocks the calling thread the entire time instead of suspending it. Any caller that assumes a `suspend` function yields the thread (which is the entire point of the keyword) will be surprised when the thread is held hostage.

**Fix:** After removing `runBlocking` (CHANGE 1), `loadPixels` directly `return`s `cache.getOrLoad(imageId)`, making the function genuinely suspending — it will yield the thread whenever `cache.getOrLoad` needs to wait, consistent with what the `suspend` marker promises.

**Explanation:** The Kotlin coroutines contract for `suspend` functions is that they may pause execution without blocking the underlying thread. Wrapping a `suspend` call inside `runBlocking` breaks this contract: the function looks cooperative to callers but behaves like a blocking call underneath. This matters beyond deadlocks — thread-pool sizing, back-pressure, and structured-concurrency cancellation all assume that `suspend` functions honour the non-blocking contract. Once `runBlocking` is gone, the function properly suspends mid-flight and the thread is returned to the dispatcher, satisfying both the contract and the single-threaded ordering requirement that `withContext(singleThread)` already enforces.
