---
slug: result-unwrap-in-iterator-chain
track: rust
orderIndex: 64
title: Panic Hidden Inside Iterator Map
difficulty: easy
tags:
  - errors
  - iterators
  - panics
language: rust
---

## Context

This function lives in `src/ingest/csv_reader.rs`. It reads a batch of CSV rows, each containing a numeric sensor reading, and converts them into `f64` values for downstream aggregation. The function is called from a background worker that processes thousands of files per hour.

Operators occasionally see the worker process crash with `thread 'worker-3' panicked at 'called Option::unwrap() on a None value'`, always in the middle of a large file. Examination of the failing files shows they contain a handful of rows where the sensor column is blank or contains the string `"N/A"`. The crashes bring down the whole worker process, losing progress on the current batch.

The team has confirmed that malformed rows are expected and should be silently skipped, not cause a crash.

## Buggy code

```rust
pub fn parse_sensor_readings(rows: &[Vec<String>], col_index: usize) -> Vec<f64> {
    rows.iter()
        .map(|row| {
            let cell = row.get(col_index).unwrap();
            cell.trim().parse::<f64>().unwrap()
        })
        .collect()
}
```
