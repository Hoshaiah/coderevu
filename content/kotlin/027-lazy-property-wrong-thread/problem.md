---
slug: lazy-property-wrong-thread
track: kotlin
orderIndex: 27
title: Lazy Property Not Thread-Safe
difficulty: hard
tags:
  - coroutines
  - concurrency
  - lazy-initialization
language: kotlin
---

## Context

This is in `cache/ThumbnailCache.kt`, a singleton used in a multi-threaded image loading pipeline. The cache initializes a disk-backed `LruCache` lazily on first access. The pipeline dispatches work across `Dispatchers.IO`, so multiple coroutines may access the cache simultaneously at startup.

QA occasionally sees corrupted or partially initialized cache state at startup — some images are returned as blank even though they were written correctly. Adding logging shows the `LruCache` constructor runs more than once on rapid startup. The bug is non-deterministic and harder to reproduce on release builds.

## Buggy code

```kotlin
import android.util.LruCache
import java.io.File

class ThumbnailCache(private val cacheDir: File) {

    private val cache: LruCache<String, ByteArray> by lazy(LazyThreadSafetyMode.NONE) {
        val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
        val cacheSize = maxMemory / 8
        LruCache(cacheSize)
    }

    fun get(key: String): ByteArray? = cache[key]

    fun put(key: String, data: ByteArray) {
        cache.put(key, data)
    }
}
```
