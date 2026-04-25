---
slug: struct-self-referential-lifetime-mismatch
track: rust
orderIndex: 13
title: Lifetime Annotation Outlives Field
difficulty: medium
tags:
  - lifetimes
  - borrowing
  - structs
language: rust
---

## Context

This is in `src/parser/token_stream.rs`. The `TokenStream` struct wraps a borrowed string slice and provides methods to extract tokens. It's used by the query parser to avoid heap allocations during hot-path parsing.

The function `make_stream` returns a `TokenStream` that borrows from a local `String`. It compiles on older toolchains with some warning suppression flags but fails on the current stable compiler. When a teammate added a regression test the CI pipeline started failing with a borrow-checker error that was hard to pin down.

The team had already ruled out incorrect lifetime annotations on the method bodies themselves — the issue is specifically in how the function signature relates the output lifetime to its input.

## Buggy code

```rust
pub struct TokenStream<'a> {
    source: &'a str,
    pos: usize,
}

impl<'a> TokenStream<'a> {
    pub fn new(source: &'a str) -> Self {
        TokenStream { source, pos: 0 }
    }

    pub fn next_token(&mut self) -> Option<&'a str> {
        let start = self.pos;
        while self.pos < self.source.len()
            && !self.source.as_bytes()[self.pos].is_ascii_whitespace()
        {
            self.pos += 1;
        }
        // skip whitespace
        while self.pos < self.source.len()
            && self.source.as_bytes()[self.pos].is_ascii_whitespace()
        {
            self.pos += 1;
        }
        if start == self.pos {
            None
        } else {
            Some(&self.source[start..self.pos - 1])
        }
    }
}

pub fn make_stream<'a>(input: &'a str) -> TokenStream<'a> {
    let owned = format!("prefix_{}", input);
    TokenStream::new(&owned)
}
```
