---
slug: partial-move-out-of-struct
track: rust
orderIndex: 23
title: Partial Move Breaks Struct Access
difficulty: easy
tags:
  - ownership
  - move-semantics
  - structs
language: rust
---

## Context

This code lives in `src/pipeline/record.rs`, part of a data-ingestion pipeline that transforms raw CSV rows into typed `Record` values. The struct holds both a `name` (a heap-allocated `String`) and a numeric `id`, and the `into_parts` function is meant to decompose a record into its components before archiving.

Users report a compile error the moment a junior engineer tried to add a fallback log line after the call to `into_parts`. The compiler message mentions 'use of partially moved value' and points at the `record.id` access, which looks completely innocent to the team.

The surrounding tests compile and run fine because they don't reference the struct after the call. The engineer has not yet touched the logic, only added a debug line.

## Buggy code

```rust
pub struct Record {
    pub id: u64,
    pub name: String,
}

pub fn into_parts(record: Record) -> (u64, String) {
    let name = record.name; // moves `name` out of `record`
    let id = record.id;
    (id, name)
}

pub fn archive_record(record: Record) {
    let (id, name) = into_parts(record);
    println!("archived id={} name={}", id, name);
    // Bug: the line below was added for debugging
    println!("original id was {}", record.id);
}
```
