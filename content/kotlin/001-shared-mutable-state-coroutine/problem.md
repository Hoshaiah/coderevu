---
slug: shared-mutable-state-coroutine
track: kotlin
orderIndex: 1
title: "Race on Shared Counter Increment"
difficulty: easy
tags: ["coroutines", "concurrency", "shared-state"]
language: kotlin
---

## Context

This code lives in `analytics/EventAggregator.kt`, a background worker that counts processed events across multiple coroutines. The aggregator is launched during app startup and runs coroutines concurrently to process batches from a queue.

In production, the final event count reported to the dashboard is consistently lower than the number of events actually sent. Discrepancies of 5–15% are typical under load, and the number varies per run, which rules out an off-by-one in the batch size logic.

The team has already verified that all events are being dispatched correctly — logging shows every batch being submitted. The undercounting only manifests when concurrency is greater than 1.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class EventAggregator {
    private var processedCount = 0

    suspend fun processAll(batches: List<List<String>>) = coroutineScope {
        batches.map { batch ->
            launch(Dispatchers.Default) {
                batch.forEach { event ->
                    process(event)
                    processedCount++
                }
            }
        }.joinAll()
    }

    fun report(): Int = processedCount

    private fun process(event: String) {
        // simulate work
    }
}
```
