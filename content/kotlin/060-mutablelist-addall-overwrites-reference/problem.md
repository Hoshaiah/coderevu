---
slug: mutablelist-addall-overwrites-reference
track: kotlin
orderIndex: 60
title: addAll Accumulates Into Wrong List
difficulty: easy
tags:
  - collections
  - mutation
  - correctness
language: kotlin
---

## Context

This ETL utility in `pipeline/BatchAggregator.kt` collects records from multiple pages of an API response into a single list before bulk-inserting them into the database. The `aggregate` function is called once per job run and is expected to return all records from all pages combined.

In production the bulk insert always contains only the records from the final page. Earlier pages are silently dropped. No errors are thrown and the function returns a non-empty list, so the bug was not caught by the basic smoke test which only checked that the result was non-empty.

Adding log statements showed the intermediate page results are fetched correctly — the issue is purely in how they are combined.

## Buggy code

```kotlin
class BatchAggregator(private val api: RecordApi) {

    fun aggregate(pageCount: Int): List<Record> {
        var result = mutableListOf<Record>()
        for (page in 1..pageCount) {
            val pageRecords = api.fetchPage(page)
            result = pageRecords.toMutableList()
            result.addAll(pageRecords)
        }
        return result
    }
}
```
