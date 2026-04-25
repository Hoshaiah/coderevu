---
slug: coroutine-withcallercontext-structured-cancel
track: kotlin
orderIndex: 36
title: Scope Cancel Skips Finally Block
difficulty: hard
tags:
  - coroutines
  - resource-management
  - correctness
language: kotlin
---

## Context

This file upload handler lives in `upload/ChunkedUploader.kt` and manages a multi-part file upload to an S3-compatible storage service. After all chunks are uploaded, it must call `finaliseUpload()` to commit the multi-part upload — failing to do so leaves orphaned partial uploads that incur storage costs.

In production, the S3 bucket is accumulating abandoned partial uploads at a rate that correlates with user cancellations (e.g., navigating away). CloudWatch billing alerts started firing last month. The `finally` block that calls `finaliseUpload()` is supposed to run in all cases but is being skipped when the coroutine scope is cancelled externally.

The developer verified that a normal `CancellationException` propagates through `try/finally` correctly in Kotlin coroutines. The bug is subtler: `finaliseUpload()` is itself a `suspend` function, and calling a suspend function from a `finally` block inside a cancelled coroutine silently fails to execute.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class ChunkedUploader(private val scope: CoroutineScope) {

    fun startUpload(fileBytes: ByteArray): Job {
        return scope.launch {
            val uploadId = initiateMultipart()
            try {
                uploadChunks(fileBytes, uploadId)
            } finally {
                // BUG: finaliseUpload is suspend — calling it in a finally
                // block of a cancelled coroutine throws CancellationException
                // immediately, before the function body runs.
                finaliseUpload(uploadId)
            }
        }
    }

    private suspend fun initiateMultipart(): String {
        delay(10)
        return "upload-id-123"
    }

    private suspend fun uploadChunks(bytes: ByteArray, uploadId: String) {
        delay(500) // simulate chunked upload
    }

    private suspend fun finaliseUpload(uploadId: String) {
        delay(50) // S3 commit call
        println("Finalised upload $uploadId")
    }
}
```
