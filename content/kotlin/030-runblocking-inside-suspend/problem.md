---
slug: runblocking-inside-suspend
track: kotlin
orderIndex: 30
title: runBlocking Inside suspend Function
difficulty: hard
tags:
  - coroutines
  - deadlock
  - api-misuse
language: kotlin
---

## Context

`ImageProcessor.kt` processes images in a pipeline. A legacy utility function `loadPixels` is synchronous and was wrapped with `runBlocking` so it could call a suspending cache lookup internally. The function is itself marked `suspend` and is called from coroutines running on a single-threaded dispatcher.

In staging, the image pipeline deadlocks completely when cache misses occur. The thread dump shows the single worker thread blocked inside `runBlocking`, waiting for the inner coroutine to resume — but that inner coroutine is also waiting for the same thread, which is occupied by `runBlocking`. Processing never resumes.

Swapping to `Dispatchers.IO` in tests makes the deadlock disappear, which caused the team to dismiss it. The production pipeline uses a single-threaded `Executor` dispatcher for deterministic ordering.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class ImageProcessor(private val cache: PixelCache) {

    private val singleThread = Executors.newSingleThreadExecutor().asCoroutineDispatcher()

    suspend fun loadPixels(imageId: String): IntArray {
        // runBlocking blocks the current thread and tries to schedule
        // the inner coroutine on the same single thread — deadlock
        return runBlocking {
            cache.getOrLoad(imageId)  // suspending function
        }
    }

    suspend fun process(imageId: String): ProcessedImage {
        val pixels = withContext(singleThread) {
            loadPixels(imageId)
        }
        return doProcess(pixels)
    }
}
```
