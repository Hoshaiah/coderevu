---
slug: lifetime-bound-missing-on-trait-object
track: rust
orderIndex: 18
title: Missing Lifetime Bound on Trait Object
difficulty: hard
tags:
  - lifetimes
  - trait-objects
  - borrowing
language: rust
---

## Context

This snippet is from `src/middleware/filter.rs` in an HTTP middleware stack. `RequestFilter` is a trait implemented by various middleware components. The `FilterChain` struct is supposed to hold a heterogeneous list of filters as boxed trait objects so the chain can be built at runtime from config.

The code fails to compile with a lifetime error that mentions 'the parameter type `dyn RequestFilter` may not live long enough'. The error appears on the `Box<dyn RequestFilter>` field. A teammate suggested adding `+ 'static` but was overruled because some filters borrow from application config that lives for the process lifetime but isn't declared `'static`.

The real issue is that the struct silently assumes borrowed data lives arbitrarily long, and the fix is to make the lifetime requirement explicit rather than implicit.

## Buggy code

```rust
pub trait RequestFilter {
    fn filter(&self, path: &str) -> bool;
}

// Bug: Box<dyn RequestFilter> implicitly requires 'static
// but the struct itself has no lifetime parameter to express
// that the contained filters may borrow shorter-lived data.
pub struct FilterChain {
    filters: Vec<Box<dyn RequestFilter>>,
}

impl FilterChain {
    pub fn new() -> Self {
        FilterChain { filters: Vec::new() }
    }

    pub fn add<F: RequestFilter + 'static>(&mut self, f: F) {
        self.filters.push(Box::new(f));
    }

    pub fn run(&self, path: &str) -> bool {
        self.filters.iter().all(|f| f.filter(path))
    }
}

pub struct PrefixFilter<'a> {
    prefix: &'a str,
}

impl<'a> RequestFilter for PrefixFilter<'a> {
    fn filter(&self, path: &str) -> bool {
        path.starts_with(self.prefix)
    }
}

pub fn build_chain<'a>(prefix: &'a str) -> FilterChain {
    let mut chain = FilterChain::new();
    // This line won't compile: PrefixFilter<'a> does not satisfy 'static
    chain.add(PrefixFilter { prefix });
    chain
}
```
