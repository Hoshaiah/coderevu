---
slug: sequence-flatmap-infinite-hang
track: kotlin
orderIndex: 83
title: Infinite Sequence in flatMap Hangs
difficulty: medium
tags:
  - collections
  - coroutines
  - performance
language: kotlin
---

## Context

`ReportGenerator.kt` produces paginated report sections by mapping each section ID through a lazy `Sequence`. A helper `generatePages` returns a sequence of pages for a section. The final output is collected into a `List` and serialized to JSON. The code uses sequences to avoid materializing all pages in memory at once for large reports.

The service hangs on specific report types and never returns. Memory usage stays flat (ruling out an OOM), but one CPU core is pegged at 100%. The hang is reproducible with any report that includes a section of type `APPENDIX`. Other section types complete normally.

Engineers narrowed it down to `generatePages` for `APPENDIX` sections — when called in isolation it returns data correctly. The issue appears only when composed inside the sequence pipeline.

## Buggy code

```kotlin
data class ReportSection(val id: String, val type: String)
data class Page(val sectionId: String, val pageNumber: Int, val content: String)

fun generatePages(section: ReportSection): Sequence<Page> {
    return if (section.type == "APPENDIX") {
        generateSequence(1) { it + 1 }.map { pageNum ->
            Page(section.id, pageNum, "Appendix page $pageNum")
        }
    } else {
        (1..5).asSequence().map { pageNum ->
            Page(section.id, pageNum, "Page $pageNum of ${section.id}")
        }
    }
}

fun buildReport(sections: List<ReportSection>): List<Page> {
    return sections.asSequence()
        .flatMap { generatePages(it) }
        .toList()
}
```
