---
slug: launch-fire-forget-exception-lost
track: kotlin
orderIndex: 15
title: Uncaught Exception in fire-and-forget launch
difficulty: medium
tags:
  - coroutines
  - exception-handling
  - android
language: kotlin
---

## Context

In `sync/SyncManager.kt`, a background sync is triggered from a button tap. To avoid blocking the UI, the sync is launched as a fire-and-forget coroutine on `viewModelScope`. If the sync fails, the intent was to show a Snackbar error. The ViewModel exposes an error `StateFlow` that the Fragment observes.

During QA, testers found that network errors during sync crash the app with an unhandled exception instead of showing the Snackbar. The ViewModel's `CoroutineExceptionHandler` is passed to the `async` builder inside the launch, but the crash still occurs. Logcat shows the exception propagating to the uncaught exception handler.

The team confirmed the `CoroutineExceptionHandler` logic is correct when tested in isolation. The problem is specifically with how it is installed.

## Buggy code

```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow

class SyncViewModel : ViewModel() {

    val errorMessage = MutableStateFlow<String?>(null)

    fun triggerSync() {
        viewModelScope.launch {
            val handler = CoroutineExceptionHandler { _, throwable ->
                errorMessage.value = throwable.message
            }
            val deferred = async(handler) {
                performSync()
            }
            deferred.await()
        }
    }

    private suspend fun performSync() {
        // simulate network call that may throw
        throw IOException("Network unavailable")
    }
}
```
