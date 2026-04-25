---
slug: iterator-remove-wrong-collection
track: kotlin
orderIndex: 61
title: Iterator Remove on Wrong Collection
difficulty: easy
tags:
  - collections
  - iteration
  - correctness
language: kotlin
---

## Context

In `cache/DuplicateFilter.kt`, incoming message IDs are de-duplicated against a seen-set before being forwarded to a downstream processor. The filter maintains two collections: a `LinkedHashSet` for O(1) lookup of already-seen IDs, and an `ArrayDeque` as a sliding window to evict old IDs when the cache exceeds a maximum size.

In production the seen-set grows without bound, causing `OutOfMemoryError` after several hours. Metrics show the eviction branch is reached (the log line fires) but the set size counter never decreases. Heap dumps confirm the `seen` set holds millions of entries while the deque is always near-empty.

The team added logging that confirmed eviction is attempted on every 1000th message as expected. The bug is in the eviction logic itself.

## Buggy code

```kotlin
class DuplicateFilter(private val maxSize: Int = 10_000) {

    private val seen = LinkedHashSet<String>()
    private val window = ArrayDeque<String>()

    fun accept(id: String): Boolean {
        if (seen.contains(id)) return false
        seen.add(id)
        window.addLast(id)
        if (window.size > maxSize) {
            evictOldest()
        }
        return true
    }

    private fun evictOldest() {
        val iter = window.iterator()
        if (iter.hasNext()) {
            iter.next()
            iter.remove()   // removes from window — but forgets to remove from seen
        }
    }
}
```
