---
slug: collections-sortedmap-wrong-key-type
track: kotlin
orderIndex: 75
title: TreeMap Natural Order Crashes on Mixed Types
difficulty: medium
tags:
  - collections
  - nullability
  - correctness
language: kotlin
---

## Context

`PriorityTaskQueue.kt` is a scheduling component that groups tasks by a string priority tag (`"high"`, `"medium"`, `"low"`) and iterates over them in sorted order. The code uses a `sortedMapOf` (backed by `TreeMap`) so that the iteration order is always alphabetical. Tasks are added from multiple call sites throughout the codebase.

In production the queue occasionally throws `ClassCastException: class kotlin.Int cannot be cast to class kotlin.String` deep inside the `TreeMap` comparison logic. The stack trace is unhelpful — it points to JDK internals. The error does not happen during every run, only when a specific codepath adds tasks.

A junior developer added a new call site last week and passed an integer priority level by mistake. The Kotlin compiler did not warn because of the method signature used.

## Buggy code

```kotlin
import java.util.TreeMap

data class Task(val name: String, val payload: String)

class PriorityTaskQueue {
    // sortedMapOf returns a TreeMap<K, V> with natural ordering
    private val queue: MutableMap<Any, MutableList<Task>> = sortedMapOf()

    fun add(priority: Any, task: Task) {
        queue.getOrPut(priority) { mutableListOf() }.add(task)
    }

    fun drainInOrder(): List<Task> {
        return queue.values.flatten().also { queue.clear() }
    }
}

// Caller A — correct
fun scheduleHigh(q: PriorityTaskQueue, t: Task) = q.add("high", t)

// Caller B — introduced last week, wrong key type
fun scheduleLow(q: PriorityTaskQueue, t: Task) = q.add(1, t)
```
