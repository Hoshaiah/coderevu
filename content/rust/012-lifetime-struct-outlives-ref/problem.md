---
slug: lifetime-struct-outlives-ref
track: rust
orderIndex: 12
title: Struct Lifetime Shorter Than Borrow
difficulty: medium
tags:
  - lifetimes
  - structs
  - borrowing
language: rust
---

## Context

This code is in `src/query/filter.rs`, part of a query-builder library used by an internal analytics dashboard. `ColumnFilter` is a lightweight view that stores a reference to a column name and a predicate string, both sourced from a config map loaded once at startup.

The reported symptom is a compile error: `error[E0597]: config does not live long enough`. Developers keep hitting this when they try to create a `ColumnFilter` inside a helper function and return it to the caller, only to have the borrow checker reject it because the config map is a local in the helper.

No runtime panics are involved — this is purely a compile-time failure — but the team has been copy-pasting the config map into the struct (allocating `String`) everywhere as a workaround, which defeats the purpose of the zero-copy design.

## Buggy code

```rust
pub struct ColumnFilter<'a> {
    pub column: &'a str,
    pub predicate: &'a str,
}

impl<'a> ColumnFilter<'a> {
    pub fn new(column: &'a str, predicate: &'a str) -> Self {
        ColumnFilter { column, predicate }
    }

    pub fn matches(&self, value: &str) -> bool {
        value.contains(self.predicate)
    }
}

pub fn build_filter(config: &std::collections::HashMap<String, String>) -> ColumnFilter {
    let col = config.get("column").map(|s| s.as_str()).unwrap_or("id");
    let pred = config.get("predicate").map(|s| s.as_str()).unwrap_or("");
    ColumnFilter::new(col, pred)
}
```
