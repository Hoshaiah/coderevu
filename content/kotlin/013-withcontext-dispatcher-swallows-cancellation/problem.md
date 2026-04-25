---
slug: withcontext-dispatcher-swallows-cancellation
track: kotlin
orderIndex: 13
title: withContext Catches CancellationException Silently
difficulty: medium
tags:
  - coroutines
  - cancellation
  - exception-handling
language: kotlin
---

## Context

This is a network-fetch worker in `data/remote/UserRepository.kt`. It fetches user profile data inside a `viewModelScope` coroutine, wrapping the call in a `try/catch` so that network errors are converted to a `Result.Failure` and shown in the UI instead of crashing.

Operators noticed that when users navigate away mid-request, the loading spinner never disappears. The coroutine appears to keep running even after the ViewModel is cleared, and the `onCleared` callback confirms the scope is cancelled. CPU traces show the suspend function inside `withContext` finishes normally after cancellation.

The team already verified that the `Dispatchers.IO` block itself is not blocking a thread indefinitely — the HTTP call returns within the timeout. The bug is in how cancellation propagates back to the caller.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class UserRepository(private val api: UserApi) {

    suspend fun fetchUser(id: String): Result<User> {
        return try {
            val user = withContext(Dispatchers.IO) {
                api.getUser(id)
            }
            Result.success(user)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```
