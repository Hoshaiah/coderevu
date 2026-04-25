---
slug: channel-close-before-send
track: kotlin
orderIndex: 23
title: Channel Closed Before Consumers Finish
difficulty: medium
tags:
  - coroutines
  - collections
  - channel
language: kotlin
---

## Context

This is `ImagePipeline.kt` in a batch image processing service. A producer coroutine sends image file paths into a `Channel`, and multiple worker coroutines receive and process them. After all images are sent, the channel is closed and the producer waits for workers to finish.

In production, the pipeline intermittently processes only a subset of the images. No exceptions are logged. The number of processed images varies run to run and is always less than or equal to the total, suggesting some sends succeed and some don't.

Adding logging shows that `ClosedSendChannelException` is sometimes swallowed inside the producer's send loop. The team added a try/catch to suppress it, which masked the symptom but didn't fix the underlying data loss.

## Buggy code

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*

class ImagePipeline {
    suspend fun process(imagePaths: List<String>) = coroutineScope {
        val channel = Channel<String>(capacity = 10)

        // Launch workers first
        val workers = List(4) {
            launch {
                for (path in channel) {
                    processImage(path)
                }
            }
        }

        // Send all images
        launch {
            for (path in imagePaths) {
                channel.send(path)
            }
            channel.close()
        }

        // Wait for workers by cancelling channel after a timeout
        withTimeout(5000) {
            channel.close() // close again to unblock workers
            workers.forEach { it.join() }
        }
    }

    private suspend fun processImage(path: String) {
        delay(100)
        println("Processed: $path")
    }
}
```
