---
slug: collections-mutablemap-default-value-side-effect
track: kotlin
orderIndex: 87
title: getOrPut Runs Side Effect Unconditionally
difficulty: hard
tags:
  - collections
  - correctness
  - kotlin-idioms
language: kotlin
---

## Context

This service lives in `analytics/EventAggregator.kt` and accumulates analytics events into per-user buckets. Each user bucket is initialised by calling an external service to fetch the user's tier, which determines how events are weighted. The initialisation call is expected to happen exactly once per user per aggregation window.

In production, the external tier-fetch service is being called multiple times for the same user within a single aggregation window. Billing for the tier service is per-call, and unexpected charges are appearing. Server logs show the fetch is sometimes triggered even when the bucket already exists, particularly when multiple threads process the same user concurrently.

The team examined the code and believed `getOrPut` was safe because it 'only creates if absent'. They did not realise that the `defaultValue` lambda is evaluated before the map lookup in certain Kotlin versions, or that their specific usage evaluates the lambda eagerly due to how they structured the call.

## Buggy code

```kotlin
import java.util.concurrent.ConcurrentHashMap

data class UserBucket(val tier: String, val events: MutableList<String> = mutableListOf())

class EventAggregator {
    private val buckets = ConcurrentHashMap<String, UserBucket>()

    fun recordEvent(userId: String, event: String) {
        val bucket = getOrCreateBucket(userId)
        bucket.events.add(event)
    }

    private fun getOrCreateBucket(userId: String): UserBucket {
        return buckets.getOrPut(userId) {
            val tier = fetchUserTier(userId)  // expensive external call
            UserBucket(tier)
        }
    }

    private fun fetchUserTier(userId: String): String {
        println("Fetching tier for $userId")  // should print once per user
        return "premium"
    }
}
```
