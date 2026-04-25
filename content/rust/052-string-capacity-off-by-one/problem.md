---
slug: string-capacity-off-by-one
track: rust
orderIndex: 52
title: String Buffer Capacity Off-By-One
difficulty: easy
tags:
  - errors
  - correctness
  - performance
language: rust
---

## Context

In `src/encode/csv.rs`, a function builds a CSV row from a slice of field strings. To avoid repeated allocations it pre-computes the required capacity: the sum of all field lengths plus one comma separator between each pair. The result is appended to a caller-provided `String`.

Profiling shows the function causes exactly one unexpected reallocation per call regardless of input size. The allocation tracker in the test suite (which shadows the global allocator) confirms a single extra `realloc` inside `build_csv_row` on every invocation.

The developer counted separators as `fields.len()` instead of `fields.len() - 1`, allocating one byte too few and forcing a reallocation the moment the final field is pushed.

## Buggy code

```rust
pub fn build_csv_row(fields: &[&str], out: &mut String) {
    if fields.is_empty() {
        return;
    }

    // BUG: separator count should be fields.len() - 1, not fields.len().
    // We allocate one byte too few, causing a reallocation on the last field.
    let capacity: usize = fields.iter().map(|f| f.len()).sum::<usize>() + fields.len();
    out.reserve(capacity);

    let mut first = true;
    for field in fields {
        if !first {
            out.push(',');
        }
        out.push_str(field);
        first = false;
    }
    out.push('\n');
}
```
