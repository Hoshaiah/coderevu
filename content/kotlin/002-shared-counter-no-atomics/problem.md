---
slug: shared-counter-no-atomics
track: kotlin
orderIndex: 2
title: Race on Coroutine Counter Increment
difficulty: easy
tags:
  - coroutines
  - concurrency
  - atomics
language: kotlin
---

## Context

This lives in `analytics/EventCounter.kt`, a background worker that counts incoming events from multiple concurrent coroutines. It's launched with `Dispatchers.Default` so it runs on the shared thread pool. The count is read at the end of each batch window and written to a database.

Operators noticed the final count is always slightly lower than the number of events actually emitted. The gap grows with higher parallelism — at 4 threads it loses maybe 5%, at 8 threads it loses closer to 20%. No exceptions are thrown.

The team already verified that all events are enqueued correctly and that the DB write reads the right field. The problem is definitely in the accumulation step.

## Buggy code

```kotlin
import kotlinx.coroutines.*

class EventCounter {
    private var count = 0

    suspend fun processBatch(events: List<String>) = coroutineScope {
        events.map { event ->
            launch(Dispatchers.Default) {
                // simulate processing
                count++
            }
        }.joinAll()
    }

    fun total(): Int = count
}
```
