---
slug: runblocking-main-thread
track: kotlin
orderIndex: 9
title: runBlocking Deadlock on Main Thread
difficulty: medium
tags:
  - coroutines
  - android
  - deadlock
language: kotlin
---

## Context

`data/UserRepository.kt` provides user data to the UI layer. A junior developer used `runBlocking` to make the async `fetchUser` suspend function callable from non-suspending contexts like `onCreate`, reasoning that "it just blocks until done, which is fine for a quick call".

On Android, the app freezes completely when `loadUser()` is called from the main thread. The ANR dialog appears after 5 seconds. Logcat shows the main thread is blocked, but no deadlock is logged — the coroutine appears to be running, just never completing.

The developer confirmed on a desktop JVM the code works fine. The behavior is Android-specific, pointing to something about how the main thread dispatcher works there.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class UserRepository(private val api: UserApi) {

    // Called from Activity.onCreate on the main thread
    fun loadUser(userId: String): User {
        return runBlocking {
            fetchUser(userId)
        }
    }

    private suspend fun fetchUser(userId: String): User {
        return withContext(Dispatchers.Main) {
            api.getUser(userId)
        }
    }
}

interface UserApi {
    suspend fun getUser(id: String): User
}

data class User(val id: String, val name: String)
```
