---
slug: coroutine-timeout-cancels-parent
track: kotlin
orderIndex: 34
title: withTimeout Cancels Parent Scope
difficulty: hard
tags:
  - coroutines
  - android
  - collections
language: kotlin
---

## Context

This service class lives in `com/example/network/ProfileService.kt`. It fetches a user profile with a timeout. The function is called from a `ViewModel` using `viewModelScope.launch`. The intent is to gracefully degrade: if the network call takes longer than 2 seconds, skip the profile fetch and continue with a cached value.

In production, when the network is slow, the entire `viewModelScope` is cancelled — not just the profile fetch. All other ongoing work in the ViewModel (analytics, background syncs launched from the same scope) stops immediately. Users report the app goes blank after a slow profile load.

The team tried wrapping the call in `try/catch(Exception)` at the call site, but the scope still gets cancelled.

## Buggy code

```kotlin
import kotlinx.coroutines.*

data class UserProfile(val id: String, val name: String)

class ProfileService(
    private val api: ProfileApi,
    private val cache: ProfileCache
) {
    suspend fun fetchProfile(userId: String): UserProfile {
        return try {
            withTimeout(2_000L) {
                api.getProfile(userId)
            }
        } catch (e: TimeoutCancellationException) {
            cache.getLastKnownProfile(userId)
                ?: UserProfile(userId, "Unknown")
        }
    }
}
```
