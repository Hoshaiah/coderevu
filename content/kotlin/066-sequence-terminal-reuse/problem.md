---
slug: sequence-terminal-reuse
track: kotlin
orderIndex: 66
title: Consumed Sequence Used Twice
difficulty: easy
tags:
  - collections
  - coroutines
  - correctness
language: kotlin
---

## Context

This utility lives in `com/example/etl/RecordPipeline.kt`. It processes a large dataset from a CSV file using a `Sequence` to avoid loading everything into memory. The pipeline parses, filters, then both counts and maps the records in two separate terminal operations.

In production, the reported count always matches the actual number of records, but the transformed output list is always empty. The bug appears only when both `count()` and `toList()` are called on the same value. The developer verified the CSV file has data and the filter predicate is correct.

No coroutines or threading are involved — this is a straightforward sequential pipeline.

## Buggy code

```kotlin
import java.io.File

data class Record(val id: String, val value: Double, val valid: Boolean)

class RecordPipeline {

    fun process(csvFile: File): Pair<Int, List<String>> {
        val records: Sequence<Record> = csvFile
            .bufferedReader()
            .lineSequence()
            .drop(1) // skip header
            .map { line ->
                val parts = line.split(",")
                Record(parts[0], parts[1].toDouble(), parts[2].toBooleanStrict())
            }
            .filter { it.valid }

        val count = records.count()
        val summaries = records.map { "${it.id}: ${it.value}" }.toList()

        return Pair(count, summaries)
    }
}
```
