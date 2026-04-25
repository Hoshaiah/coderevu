---
slug: collections-distinct-by-reference
track: kotlin
orderIndex: 62
title: distinctBy Compares Data Class References
difficulty: easy
tags:
  - collections
  - data-classes
  - correctness
language: kotlin
---

## Context

`ReportAggregator.kt` is part of an analytics pipeline that merges telemetry events from multiple upstream sources. Before writing the merged list to the database, it deduplicates by event ID to avoid inserting duplicates when two sources report the same event.

Operators notice that the deduplicated output still contains duplicate event IDs. The issue is consistent and reproducible: events that appear in both source A and source B always make it into the final list twice. The database subsequently throws a unique-constraint violation on every batch insert.

The developer checked that the event IDs are identical strings and that `equals` works correctly on `String`. No custom `Comparator` is involved.

## Buggy code

```kotlin
data class TelemetryEvent(
    val id: String,
    val source: String,
    val payload: Map<String, Any>
)

class ReportAggregator {
    fun merge(sourceA: List<TelemetryEvent>, sourceB: List<TelemetryEvent>): List<TelemetryEvent> {
        val combined = sourceA + sourceB
        // Deduplicate events that appear in multiple sources
        return combined.distinctBy { it }
    }
}
```
