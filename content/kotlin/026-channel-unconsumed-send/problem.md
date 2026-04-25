---
slug: channel-unconsumed-send
track: kotlin
orderIndex: 26
title: Unconsumed Channel Causes Suspension
difficulty: hard
tags:
  - coroutines
  - channels
  - deadlock
language: kotlin
---

## Context

`worker/ImageProcessor.kt` uses a coroutine `Channel` to pipeline image upload tasks. A producer coroutine sends file paths into the channel and a consumer coroutine processes them. The code is used in a background service that processes batches of user-uploaded images.

The service hangs indefinitely on large batches. Metrics show the producer goroutine suspends partway through the batch and never resumes. The consumer appears to finish its last item and exit cleanly. The service process has to be killed manually.

Small batches (under 10 items) always complete successfully. The bug only manifests when the batch size exceeds the channel buffer capacity.

## Buggy code

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*

class ImageProcessor {

    suspend fun processBatch(filePaths: List<String>) = coroutineScope {
        val channel = Channel<String>(capacity = 5)

        val producer = launch {
            for (path in filePaths) {
                channel.send(path)  // suspends when buffer is full
            }
        }

        val consumer = launch {
            for (i in filePaths.indices) {
                val path = channel.receive()
                processImage(path)
                if (path.endsWith("_last.jpg")) {
                    break  // early exit
                }
            }
        }

        consumer.join()
        producer.cancelAndJoin()
    }

    private suspend fun processImage(path: String) {
        delay(10)
        println("Processed: $path")
    }
}
```
