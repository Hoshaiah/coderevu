---
slug: coroutine-flow-catch-rethrows-wrong
track: kotlin
orderIndex: 38
title: Flow catch Swallows Cancellation
difficulty: hard
tags:
  - coroutines
  - flow
  - cancellation
language: kotlin
---

## Context

This data pipeline lives in `SyncRepository.kt`. It uses a Kotlin `Flow` to stream records from a remote source, applies some transformation, and catches errors to emit a fallback value so downstream collectors never see an exception. The flow is collected inside a coroutine launched in a `viewModelScope`.

QA engineers found that cancelling a sync in progress (e.g. user navigates away, triggering `viewModelScope` cancellation) sometimes hangs the UI indefinitely. The sync coroutine appears to keep running even after the ViewModel is cleared. In some cases the app eventually crashes with an out-of-memory error after many accumulated ghost syncs.

The developer confirmed that the ViewModel is correctly cleared and its scope is cancelled. Adding logs inside the `catch` block shows it is being invoked during cancellation.

## Buggy code

```kotlin
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class SyncRepository(private val remoteSource: RemoteSource) {

    fun syncFlow(): Flow<SyncResult> = flow {
        val records = remoteSource.fetchAll()
        records.forEach { record ->
            emit(SyncResult.Success(record.transform()))
        }
    }.catch { e ->
        emit(SyncResult.Error(e.message ?: "Unknown error"))
    }
}

sealed class SyncResult {
    data class Success(val data: String) : SyncResult()
    data class Error(val message: String) : SyncResult()
}

interface RemoteSource {
    suspend fun fetchAll(): List<Record>
}

data class Record(val raw: String) {
    fun transform(): String = raw.uppercase()
}
```
