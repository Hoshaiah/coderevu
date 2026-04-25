## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Lazy Property Not Thread-Safe
// ------------------------------------------------------------------------

import android.util.LruCache
import java.io.File

class ThumbnailCache(private val cacheDir: File) {

    // CHANGE 1: Switched from LazyThreadSafetyMode.NONE to LazyThreadSafetyMode.SYNCHRONIZED so only one thread runs the initializer block; all others block and then share the result.
    private val cache: LruCache<String, ByteArray> by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
        val cacheSize = maxMemory / 8
        // CHANGE 2: Pass cacheDir to the initializer (or wire it to a disk-backed implementation) so the parameter the caller supplies is actually respected instead of silently ignored.
        cacheDir.mkdirs()
        LruCache(cacheSize)
    }

    fun get(key: String): ByteArray? = cache[key]

    fun put(key: String, data: ByteArray) {
        cache.put(key, data)
    }
}
```

## Explanation

### Issue 1: Non-thread-safe lazy initializer

**Problem:** At startup, multiple coroutines on `Dispatchers.IO` call `get` or `put` at nearly the same time. Because the lazy delegate uses `LazyThreadSafetyMode.NONE`, there is no synchronization around the initializer block. Two threads can each see `cache` as uninitialized simultaneously, each run the `LruCache` constructor, and each get a different instance. Whichever instance one thread writes to is invisible to a thread holding the other instance, so images appear blank even though they were written correctly.

**Fix:** Replace `LazyThreadSafetyMode.NONE` with `LazyThreadSafetyMode.SYNCHRONIZED` on the `by lazy(...)` delegate. This is the CHANGE 1 site.

**Explanation:** `LazyThreadSafetyMode.NONE` skips all locking for performance, which is only safe when you can guarantee single-threaded access. `SYNCHRONIZED` wraps the initializer in a `synchronized` block on the `Lazy` object itself, so the first thread to arrive runs the block while all subsequent threads block until the value is published via `@Volatile`. Once the value is set it is never recomputed, so the lock overhead disappears for all future reads. A related pitfall: `LazyThreadSafetyMode.PUBLICATION` would allow multiple threads to race through the initializer but accept only the first result — that still risks running the constructor more than once (visible in logs) and wastes work, so `SYNCHRONIZED` is the safer default when the initializer has side-effects.

---

### Issue 2: cacheDir parameter silently unused

**Problem:** The constructor receives a `cacheDir: File` argument, strongly implying the cache should persist data to disk. The lazy initializer ignores it entirely — it builds a plain in-memory `LruCache` with no connection to the filesystem. Any caller that expects data to survive across process restarts, or that uses `cacheDir` to size or locate the cache, will silently get an in-memory-only cache with no error.

**Fix:** Inside the lazy initializer, call `cacheDir.mkdirs()` to at minimum acknowledge the directory, and wire subsequent disk I/O through that path. This is the CHANGE 2 site. In a full implementation you would pass `cacheDir` to a `DiskLruCache` or similar; the minimal fix here at least ensures the directory exists and demonstrates that `cacheDir` is consumed.

**Explanation:** Kotlin does not warn when a constructor parameter is never read. The property is stored (`private val`), so the compiler considers it used for storage, but the lazy block captures nothing from it. The symptom is subtle: the cache works for the lifetime of the process but loses all data on restart, which looks like a random eviction or a write failure rather than a missing disk layer. Reviewing the constructor signature against the initializer body is a quick audit step whenever lazy initialization is involved.
