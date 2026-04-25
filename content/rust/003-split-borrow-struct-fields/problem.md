---
slug: split-borrow-struct-fields
track: rust
orderIndex: 3
title: Mutable and Shared Borrow of Struct
difficulty: easy
tags:
  - borrowing
  - structs
  - closures
language: rust
---

## Context

This code lives in `src/pipeline/processor.rs`, a batch-processing worker that transforms log records. `Processor` holds both a buffer of pending records and a set of already-seen keys used for deduplication.

The function `process_next` tries to look up the key in `seen` while simultaneously building the next entry into `buffer`. The compiler refuses to compile the function with a borrow error, but the intent is clear and correct: `seen` and `buffer` are independent fields.

A teammate added a comment saying "just clone the key" and moved on, but that allocates on every record in a hot loop running 200k records per second.

## Buggy code

```rust
use std::collections::HashSet;

pub struct Processor {
    pub buffer: Vec<String>,
    pub seen: HashSet<String>,
}

impl Processor {
    pub fn process_next(&mut self, key: String, value: String) {
        let is_new = self.check_and_insert(&key);
        if is_new {
            self.buffer.push(format!("{}: {}", key, value));
        }
    }

    fn check_and_insert(&mut self, key: &str) -> bool {
        if self.seen.contains(key) {
            return false;
        }
        self.seen.insert(key.to_owned());
        // Now try to log the current buffer length via a shared ref
        let _len = self.buffer.len();
        true
    }

    pub fn flush(&mut self) -> Vec<String> {
        let result = &self.buffer;
        self.buffer.clear();
        result.to_vec()
    }
}
```
