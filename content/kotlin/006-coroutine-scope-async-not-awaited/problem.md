---
slug: coroutine-scope-async-not-awaited
track: kotlin
orderIndex: 6
title: async Result Never Awaited
difficulty: easy
tags:
  - coroutines
  - error-handling
  - correctness
language: kotlin
---

## Context

This image upload handler lives in `UploadManager.kt`. It starts a thumbnail-generation job concurrently with the main upload using `async` so both can proceed in parallel. Once both are done, it returns a composite result to the caller. The code is part of a mobile app's media pipeline.

Crash reports show that thumbnail generation occasionally fails, but the app reports success to the user and no error is surfaced in logs. The main upload completes correctly. QA cannot reliably reproduce the failure, but users intermittently complain that thumbnails are missing even after a reported successful upload.

The developer verified that `generateThumbnail` does throw an exception on failure and that exception handling elsewhere in the app works correctly. The issue is isolated to this particular call site.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class UploadManager(private val storage: StorageClient) {

    suspend fun uploadWithThumbnail(imageBytes: ByteArray): UploadResult {
        return coroutineScope {
            val thumbnailJob = async {
                storage.generateThumbnail(imageBytes)
            }

            val uploadUrl = storage.uploadOriginal(imageBytes)

            UploadResult(url = uploadUrl, thumbnailGenerated = true)
        }
    }
}

data class UploadResult(val url: String, val thumbnailGenerated: Boolean)

interface StorageClient {
    suspend fun uploadOriginal(bytes: ByteArray): String
    suspend fun generateThumbnail(bytes: ByteArray)
}
```
