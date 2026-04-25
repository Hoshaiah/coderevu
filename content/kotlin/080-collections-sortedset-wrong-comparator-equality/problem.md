---
slug: collections-sortedset-wrong-comparator-equality
track: kotlin
orderIndex: 80
title: TreeSet Comparator Drops Equal Items
difficulty: medium
tags:
  - collections
  - correctness
  - android
language: kotlin
---

## Context

This deduplication utility lives in `EventDeduplicator.kt`. It maintains a sorted set of processed event IDs to allow fast range queries (e.g. "all events before timestamp T"). Events are added as they arrive, and the set is occasionally pruned. The `TreeSet` uses a custom comparator that sorts by timestamp first.

Data engineers noticed that some events are silently dropped — specifically, events that share the same timestamp as an already-inserted event, even when their `eventId` fields are different. The set should store all distinct events by ID, but it appears to treat two events with equal timestamps as duplicates.

The team confirmed the data upstream is correct and the events genuinely have different IDs. The issue was not caught in testing because the test data used strictly increasing timestamps.

## Buggy code

```kotlin
import java.util.TreeSet

data class ProcessedEvent(
    val eventId: String,
    val timestamp: Long,
    val payload: String
)

class EventDeduplicator {

    private val processedEvents: TreeSet<ProcessedEvent> = TreeSet(
        compareBy { it.timestamp }
    )

    fun record(event: ProcessedEvent): Boolean {
        return processedEvents.add(event)
    }

    fun countBefore(timestamp: Long): Int {
        val sentinel = ProcessedEvent("", timestamp, "")
        return processedEvents.headSet(sentinel).size
    }
}
```
