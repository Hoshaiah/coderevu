---
slug: mutex-reentrant-deadlock
track: kotlin
orderIndex: 35
title: Reentrant Mutex Causes Deadlock
difficulty: hard
tags:
  - coroutines
  - collections
  - android
language: kotlin
---

## Context

This class lives in `com/example/storage/UserStore.kt`. It uses a `Mutex` to protect concurrent access to an in-memory user map. `updateUser` acquires the lock, updates the user, then calls `getUser` to return the freshly stored value. This is designed to be called from multiple coroutines concurrently.

In production, calls to `updateUser` occasionally hang indefinitely, starving the coroutine pool. Thread dump analysis shows the coroutine is suspended inside `getUser` waiting for the `Mutex` it already holds. This only happens when `updateUser` is called — `getUser` alone works fine.

The developer is aware that Kotlin's `Mutex` is not reentrant (unlike Java's `synchronized`), but is unsure how to restructure the code.

## Buggy code

```kotlin
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class User(val id: String, val name: String)

class UserStore {
    private val mutex = Mutex()
    private val users = mutableMapOf<String, User>()

    suspend fun getUser(id: String): User? {
        return mutex.withLock {
            users[id]
        }
    }

    suspend fun updateUser(user: User): User? {
        return mutex.withLock {
            users[user.id] = user
            getUser(user.id) // calls getUser which also tries to acquire mutex
        }
    }
}
```
