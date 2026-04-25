---
slug: into-iter-copies-not-moves
track: rust
orderIndex: 32
title: into_iter on Copy Type Copies
difficulty: medium
tags:
  - ownership
  - borrowing
  - iterators
language: rust
---

## Context

This code lives in `src/billing/invoice.rs` and is part of a monthly invoicing job. It builds a list of line-item amounts, applies a discount to each, and then tries to move the discounted values into a summary struct. The intent is that the original `amounts` vec should be consumed — nothing should be usable after the fact.

During a code review a senior engineer noted that a post-use assertion on `amounts` compiled without error and still yielded the original undiscounted values. The engineer expected a compile-time error since `amounts` was passed to `into_iter()`, which is supposed to consume the collection.

The team is confused about why the original `Vec<f64>` is still accessible after being iterated.

## Buggy code

```rust
pub struct Invoice {
    pub line_items: Vec<f64>,
    pub total: f64,
}

pub fn build_invoice(amounts: Vec<f64>, discount: f64) -> Invoice {
    let discounted: Vec<f64> = amounts
        .iter()
        .map(|&a| a * (1.0 - discount))
        .collect();

    // Developer expects `amounts` to be moved/consumed here.
    let _check: Vec<f64> = amounts.into_iter().collect();

    let total = discounted.iter().sum();
    Invoice {
        line_items: discounted,
        total,
    }
}
```
