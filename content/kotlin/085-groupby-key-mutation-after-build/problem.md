---
slug: groupby-key-mutation-after-build
track: kotlin
orderIndex: 85
title: Grouped Map Keys Mutated After Build
difficulty: hard
tags:
  - collections
  - mutation
  - correctness
language: kotlin
---

## Context

In `analytics/EventGrouper.kt`, incoming analytics events are grouped by a `DimensionKey` data class that holds a list of tag strings. The grouping result is stored in a field and queried later during report generation. The `DimensionKey` is built from a mutable list that comes from the caller.

In load tests, report generation intermittently returns wrong counts: events that should appear under one dimension key appear under another, or groups are not found at all when looked up by an equal key. The bug is not consistently reproducible and disappears under light load, suggesting it is related to key identity or hash code instability.

The team confirmed that no two threads touch the map simultaneously — the grouping and querying happen on the same coroutine. They also confirmed that `DimensionKey.equals` and `hashCode` are generated correctly by the data class.

## Buggy code

```kotlin
data class DimensionKey(val tags: List<String>)

class EventGrouper {

    private val groups = mutableMapOf<DimensionKey, MutableList<Event>>()

    fun add(event: Event, tags: MutableList<String>) {
        val key = DimensionKey(tags)  // tags list is stored by reference
        groups.getOrPut(key) { mutableListOf() }.add(event)
        // caller may mutate `tags` after this returns
    }

    fun getGroup(tags: List<String>): List<Event> {
        return groups[DimensionKey(tags)] ?: emptyList()
    }
}
```
