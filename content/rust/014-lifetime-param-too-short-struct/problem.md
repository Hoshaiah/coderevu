---
slug: lifetime-param-too-short-struct
track: rust
orderIndex: 14
title: Struct Lifetime Shorter Than Field
difficulty: hard
tags:
  - lifetimes
  - borrowing
  - structs
language: rust
---

## Context

This code lives in `src/pipeline/context.rs`. A `PipelineContext` struct holds a borrowed reference to a shared `Config` and a borrowed slice of raw input bytes. The context is passed through a chain of processing stages. Each stage receives a `&PipelineContext` and may create sub-contexts.

The code compiles, but the `sub_context` method is rejected with a lifetime error that a developer finds confusing. The error message mentions that the returned `PipelineContext` does not live long enough, even though it looks like the lifetimes should be compatible.

The real issue is that the struct has two lifetime parameters that should be constrained to express that the config reference must live at least as long as the input slice reference, and the returned sub-context must be tied to both. Without the bound, the compiler cannot prove the relationship.

## Buggy code

```rust
pub struct Config {
    pub max_stages: usize,
}

// BUG: The two lifetimes 'a and 'b are unrelated.
// When sub_context ties the returned struct to 'a (the self lifetime),
// the compiler cannot prove that 'b (config lifetime) lives long enough
// for the returned value, causing a spurious rejection at call sites.
pub struct PipelineContext<'a, 'b> {
    pub input: &'a [u8],
    pub config: &'b Config,
}

impl<'a, 'b> PipelineContext<'a, 'b> {
    pub fn new(input: &'a [u8], config: &'b Config) -> Self {
        PipelineContext { input, config }
    }

    // Returns a sub-context that views a slice of the current input.
    // This fails at call sites because 'b is not proven to outlive 'a.
    pub fn sub_context(&self, range: std::ops::Range<usize>) -> PipelineContext<'a, 'b> {
        PipelineContext {
            input: &self.input[range],
            config: self.config,
        }
    }
}

pub fn first_stage<'a, 'b>(ctx: &PipelineContext<'a, 'b>) -> PipelineContext<'a, 'b> {
    // This compiles because both lifetimes flow through from ctx.
    ctx.sub_context(0..ctx.input.len() / 2)
}
```
