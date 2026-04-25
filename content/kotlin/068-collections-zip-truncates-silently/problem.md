---
slug: collections-zip-truncates-silently
track: kotlin
orderIndex: 68
title: zip Silently Drops Trailing Elements
difficulty: easy
tags:
  - collections
  - correctness
language: kotlin
---

## Context

This utility function lives in `ReportBuilder.kt` and is responsible for pairing a list of report headers with a list of row values to produce a map for each CSV row. The function is called during a nightly ETL job that imports data from an external vendor.

Data engineers noticed that some rows in the output database are missing columns — specifically the last one or two fields. The vendor's CSV files have 12 header columns and 12 value columns per row, but the resulting maps only ever contain 10 or 11 entries. No error is thrown, no warning is logged, and the function returns without complaint.

The team confirmed the raw CSV files from the vendor are correct by inspecting them manually. The parsing step that splits each line into a `List<String>` was also verified to produce the right number of elements.

## Buggy code

```kotlin
fun buildRowMap(headers: List<String>, values: List<String>): Map<String, String> {
    require(headers.size == values.size) {
        "Header count (${headers.size}) must match value count (${values.size})"
    }
    return headers.zip(values).toMap()
}

fun parseRows(headerLine: String, dataLines: List<String>): List<Map<String, String>> {
    val headers = headerLine.split(",")
    return dataLines.map { line ->
        val values = line.split(",")
        buildRowMap(headers, values)
    }
}
```
