---
slug: nullable-getorput-side-effect
track: kotlin
orderIndex: 79
title: getOrPut Evaluates Default Always
difficulty: medium
tags:
  - collections
  - nullability
  - performance
language: kotlin
---

## Context

This caching layer lives in `UserProfileCache.kt`. It is used by multiple API handlers to avoid redundant network calls to the profile service. Profiles are lazily loaded the first time a user is requested, and `null` is stored explicitly when the profile service confirms a user does not exist, so absent users are not repeatedly re-fetched.

After the cache is warmed up, metrics show the profile service is still receiving far more requests than expected — roughly one request per cache lookup even for users already confirmed as non-existent. No exceptions are thrown, and the cache map itself appears to hold entries correctly when inspected in a debugger.

The team verified that the same user IDs are being passed on repeated calls, ruling out a key mismatch. The cache map type allows nullable values, which was intentional.

## Buggy code

```kotlin
import java.util.concurrent.ConcurrentHashMap

class UserProfileCache(private val profileService: ProfileService) {

    private val cache = HashMap<String, UserProfile?>()

    fun get(userId: String): UserProfile? {
        return cache.getOrPut(userId) {
            profileService.fetchProfile(userId)
        }
    }
}

data class UserProfile(val id: String, val name: String)

interface ProfileService {
    fun fetchProfile(userId: String): UserProfile?
}
```
