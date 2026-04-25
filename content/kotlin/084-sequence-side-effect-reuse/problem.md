---
slug: sequence-side-effect-reuse
track: kotlin
orderIndex: 84
title: Sequence Recomputes Side Effects on Reuse
difficulty: hard
tags:
  - collections
  - coroutines
  - correctness
language: kotlin
---

## Context

`etl/RecordPipeline.kt` builds a data transformation pipeline using Kotlin `Sequence` for lazy, memory-efficient processing of large CSV files. The pipeline reads records, validates them, and writes them to two destinations: a database and an audit log. The author chose `Sequence` specifically because the files can be millions of rows and should not all be loaded into memory at once.

In production, every record is written to the audit log twice — and some records appear in the database but not the audit log, or vice versa. The duplication and inconsistency scale with file size. The developer verified that the downstream write functions are idempotent and are not the source of duplicates.

Profiling confirms the CSV reading code is executing more times than there are actual records, meaning the source is being iterated multiple times. The sequence is only created once, so the author assumed this was impossible.

## Buggy code

```kotlin
import java.io.File

data class Record(val id: String, val value: String)

class RecordPipeline(private val csvFile: File) {

    private val records: Sequence<Record> = sequence {
        println("Reading CSV...")
        csvFile.bufferedReader().useLines { lines ->
            lines.drop(1).forEach { line ->
                val parts = line.split(",")
                yield(Record(parts[0], parts[1]))
            }
        }
    }

    fun run(db: Database, auditLog: AuditLog) {
        val validated = records.filter { it.value.isNotBlank() }

        // Write to database
        validated.forEach { db.insert(it) }

        // Write to audit log
        validated.forEach { auditLog.append(it) }
    }
}

interface Database { fun insert(r: Record) }
interface AuditLog { fun append(r: Record) }
```
