---
slug: sort-unstable-key-side-effect
track: rust
orderIndex: 58
title: Mutable Closure Side Effect in Sort
difficulty: easy
tags:
  - errors
  - ownership
  - sorting
language: rust
---

## Context

This lives in `src/pipeline/dedup.rs`, part of a batch ETL job that normalizes incoming records before writing them to a database. The function is called once per ingested file and is supposed to sort records by a computed priority score, counting how many records get a "bonus" priority boost along the way.

In CI the test that checks the bonus counter always fails: `bonus_count` ends up as 0 after the sort, no matter how many records qualify. The sort itself works fine — records come out in the right order — so the issue was initially blamed on the test fixture.

A teammate checked the `sort_by_key` docs and confirmed the key function is called the expected number of times. The counter variable is definitely in scope. The bug is subtler than a scoping issue.

## Buggy code

```rust
pub struct Record {
    pub id: u64,
    pub score: f64,
    pub flags: u32,
}

pub fn sort_records(records: &mut Vec<Record>) -> usize {
    let mut bonus_count: usize = 0;

    records.sort_by_key(|r| {
        let base = (r.score * 100.0) as i64;
        if r.flags & 0x1 != 0 {
            bonus_count += 1;
            base + 50
        } else {
            base
        }
    });

    bonus_count
}
```
