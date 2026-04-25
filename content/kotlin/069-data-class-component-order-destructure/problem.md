---
slug: data-class-component-order-destructure
track: kotlin
orderIndex: 69
title: Destructuring Binds Wrong Component
difficulty: easy
tags:
  - collections
  - correctness
  - nullability
language: kotlin
---

## Context

This event processor lives in `EventProcessor.kt`. It receives batched events from a Kafka consumer and routes them based on their type and source. Events are represented as a data class, and the routing logic uses destructuring declarations to unpack event fields for readability.

After a refactor where a new field `priority` was inserted into the `Event` data class between `source` and `type`, routing started behaving incorrectly. High-priority events were being sent to the wrong queue, and some events were dropped entirely. No compile errors or warnings were emitted.

The developer who performed the refactor only added the field and updated the places that construct `Event` objects — they did not consider that destructuring is positional, not name-based.

## Buggy code

```kotlin
data class Event(
    val id: String,
    val source: String,
    val priority: Int,
    val type: String,
    val payload: String
)

fun route(event: Event): String {
    val (id, source, type, payload) = event
    return when (type) {
        "ORDER" -> "orders-queue"
        "PAYMENT" -> "payments-queue"
        else -> "default-queue"
    }
}

fun processEvents(events: List<Event>) {
    events.forEach { event ->
        val queue = route(event)
        println("Routing event ${event.id} to $queue")
    }
}
```
