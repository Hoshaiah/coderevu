---
slug: borrow-while-iterating
track: rust
orderIndex: 1
title: "Cannot mutate a Vec while holding a reference into it"
difficulty: easy
tags: [borrowing, lifetimes, iteration]
language: rust
---

## Context

This function tries to normalize entries and append any derived entries it finds back onto the same vector. It refuses to compile with a borrow-checker error. A coworker "fixed" it by wrapping `entries` in an `Rc<RefCell<Vec<_>>>` and panicked in prod when two iterators raced. There's a simpler fix.

## Buggy code

```rust
pub struct Entry {
    pub key: String,
    pub value: i32,
}

pub fn normalize_and_fan_out(entries: &mut Vec<Entry>) {
    for entry in entries.iter_mut() {
        entry.key = entry.key.to_lowercase();
        if entry.value > 1000 {
            entries.push(Entry {
                key: format!("{}__overflow", entry.key),
                value: entry.value - 1000,
            });
        }
    }
}
```
