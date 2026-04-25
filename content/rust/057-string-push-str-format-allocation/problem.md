---
slug: string-push-str-format-allocation
track: rust
orderIndex: 57
title: Redundant Allocation in Hot Loop
difficulty: easy
tags:
  - errors
  - performance
  - strings
language: rust
---

## Context

This snippet is in `src/reporting/builder.rs`, a report builder that concatenates thousands of CSV rows into a single `String` for export. The function is called once per report generation cycle. On large datasets (100k+ rows) it runs noticeably slowly; a profiler points at heavy heap allocation inside the loop.

A senior engineer noted the function allocates a temporary `String` on every iteration even though `push_str` should avoid that. The culprit is the use of `format!` inside the loop to build the intermediate string before appending it, rather than writing directly into the output buffer.

This is not a correctness bug — the output is correct — but in the context of this platform the problem is classified as a performance correctness issue: the function is provably doing unnecessary work that causes measurable latency regressions under load.

## Buggy code

```rust
pub struct Row {
    pub id: u64,
    pub label: String,
    pub value: f64,
}

pub fn build_csv(rows: &[Row]) -> String {
    let mut out = String::new();
    out.push_str("id,label,value\n");

    for row in rows {
        // Bug: format! allocates a temporary String on every
        // iteration. That allocation is immediately appended and
        // then dropped — O(n) unnecessary heap allocations.
        let line = format!("{},{},{}\n", row.id, row.label, row.value);
        out.push_str(&line);
    }

    out
}
```
