---
slug: drop-order-struct-borrows-field
track: rust
orderIndex: 19
title: Drop Order Invalidates Field Reference
difficulty: hard
tags:
  - lifetimes
  - ownership
  - drop-order
language: rust
---

## Context

This code is in `src/tracing/span.rs`, a minimal tracing utility used in an embedded system that cannot afford heap allocation. `SpanGuard` holds a reference to a `SpanContext` and a raw label borrowed from a static configuration table. When `SpanGuard` is dropped it records the span end into the context.

The code fails to compile with a confusing lifetime error: `error[E0505]: cannot move out of 'ctx' because it is borrowed`. The engineer who wrote this assumed that because `label` is `'static` there would be no lifetime conflict, and cannot understand why the borrow checker objects.

No unsafe code is involved and no runtime behavior is affected — this is a compile-time rejection — but the team needs to understand the actual lifetime relationship so they can redesign the struct correctly.

## Buggy code

```rust
pub struct SpanContext {
    pub name: &'static str,
    pub elapsed_us: u64,
}

pub struct SpanGuard<'ctx> {
    ctx: &'ctx mut SpanContext,
    label: &'static str,
}

impl<'ctx> SpanGuard<'ctx> {
    pub fn new(ctx: &'ctx mut SpanContext, label: &'static str) -> Self {
        SpanGuard { ctx, label }
    }
}

impl<'ctx> Drop for SpanGuard<'ctx> {
    fn drop(&mut self) {
        self.ctx.name = self.label;
        self.ctx.elapsed_us += 1;
    }
}

pub fn run_span(mut ctx: SpanContext) -> SpanContext {
    let guard = SpanGuard::new(&mut ctx, "my-span");
    // Do some work
    drop(guard);
    ctx  // move ctx out after guard is dropped
}
```
