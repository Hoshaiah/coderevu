---
slug: take-on-infinite-sequence
track: kotlin
orderIndex: 73
title: Missing take on Infinite Sequence
difficulty: medium
tags:
  - collections
  - sequences
  - infinite-loop
language: kotlin
---

## Context

`ReportScheduler.kt` generates report due-dates using a Kotlin `Sequence` that yields monthly dates starting from a base date. The sequence is designed to be infinite and consumed with `take()` at the call site. A junior developer modified `collectNext` to add filtering for business days, and inadvertently removed the terminal `take()` call.

In production the scheduler thread hangs indefinitely when `collectNext` is called. The thread dump shows it stuck inside `ReportScheduler.collectNext` with no progress. No exception is ever thrown and no log line after the call is ever reached.

The call is made from a background thread so the UI is unaffected, but the scheduled report generation never completes.

## Buggy code

```kotlin
import java.time.LocalDate

class ReportScheduler {

    private fun monthlyDates(start: LocalDate): Sequence<LocalDate> = sequence {
        var current = start
        while (true) {
            yield(current)
            current = current.plusMonths(1)
        }
    }

    fun collectNext(start: LocalDate, count: Int): List<LocalDate> {
        return monthlyDates(start)
            .filter { it.dayOfWeek.value < 6 }  // business-day months only
            .toList()  // hangs — consumes infinite sequence
    }
}
```
