---
slug: collections-associateby-mutable-value
track: kotlin
orderIndex: 76
title: Shared Mutable List in associateWith
difficulty: medium
tags:
  - collections
  - nullability
  - correctness
language: kotlin
---

## Context

This utility lives in `com/example/analytics/EventGrouper.kt`. It groups incoming analytics events by user ID into a map so downstream consumers can process each user's events in batch. The `groupByUser` function is called once per processing window and the resulting map is handed off to a batch sender.

In production, the batch sender intermittently reports that some user buckets contain events belonging to other users. The grouping logic looks correct at first glance, and the bug only manifests when multiple user IDs appear in the same input list. Adding logging reveals every map entry points to the same list instance.

This is a purely sequential, single-threaded path — no concurrency is involved.

## Buggy code

```kotlin
data class AnalyticsEvent(val userId: String, val name: String)

class EventGrouper {

    fun groupByUser(events: List<AnalyticsEvent>): Map<String, List<AnalyticsEvent>> {
        val bucket = mutableListOf<AnalyticsEvent>()
        val result = mutableMapOf<String, List<AnalyticsEvent>>()

        for (event in events) {
            val existing = result[event.userId]
            if (existing == null) {
                result[event.userId] = bucket
            }
            bucket.add(event)
        }

        return result
    }
}
```
