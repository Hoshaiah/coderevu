---
slug: conflated-channel-dropped-events
track: kotlin
orderIndex: 10
title: ConflatedChannel Silently Drops Events
difficulty: medium
tags:
  - coroutines
  - channels
  - concurrency
language: kotlin
---

## Context

This is in `sync/UploadWorker.kt`. The component uses a `Channel` to queue file upload tasks from a producer coroutine scanning the filesystem and a single consumer coroutine that uploads files one at a time. The intent is that every file discovered must be uploaded exactly once.

Users report that some files are never uploaded, but no errors appear in logs. The symptom is non-deterministic — it only happens when the filesystem scanner runs faster than the uploader, which is common on large directories. The team confirmed the scanner finds the right files and calls `send` for each one.

## Buggy code

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*

class UploadWorker(private val uploader: FileUploader) {

    suspend fun run(files: List<String>) = coroutineScope {
        val channel = Channel<String>(Channel.CONFLATED)

        launch {
            for (file in files) {
                channel.send(file)
            }
            channel.close()
        }

        launch {
            for (file in channel) {
                uploader.upload(file)
            }
        }
    }
}
```
