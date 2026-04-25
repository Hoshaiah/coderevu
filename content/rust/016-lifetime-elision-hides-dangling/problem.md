---
slug: lifetime-elision-hides-dangling
track: rust
orderIndex: 16
title: Elided Lifetime Ties Output to Wrong Input
difficulty: hard
tags:
  - lifetimes
  - borrowing
  - dangling-reference
language: rust
---

## Context

This is in `src/parser/tokenizer.rs`. The tokenizer holds a reference to the source string and a cursor position. The `current_token` method is supposed to return a string slice into the *source*, but lifetime elision has quietly tied the returned lifetime to `&self` instead of to the source string stored inside the struct.

The bug manifests at call sites: callers try to drop or reborrow the `Tokenizer` while still holding a token slice, and the borrow checker rejects it with confusing errors about the `Tokenizer` being borrowed. Some developers worked around this by cloning every token to a `String`, which is a significant allocation in a hot parsing loop.

The root cause is missing lifetime annotations on the struct and method, not a logic error.

## Buggy code

```rust
pub struct Tokenizer<'a> {
    source: &'a str,
    pos: usize,
}

impl<'a> Tokenizer<'a> {
    pub fn new(source: &'a str) -> Self {
        Tokenizer { source, pos: 0 }
    }

    // BUG: elision rules bind the return lifetime to &self ('_),
    // not to 'a (the source lifetime). The token slice outlives
    // 'self' just fine, but the compiler thinks it doesn't.
    pub fn current_token(&self) -> &str {
        let end = self.source[self.pos..]
            .find(|c: char| c.is_whitespace())
            .map(|i| self.pos + i)
            .unwrap_or(self.source.len());
        &self.source[self.pos..end]
    }

    pub fn advance(&mut self, n: usize) {
        self.pos = (self.pos + n).min(self.source.len());
    }
}

pub fn first_two_tokens(src: &str) -> (&str, &str) {
    let mut t = Tokenizer::new(src);
    let first = t.current_token();
    t.advance(first.len() + 1);
    // ERROR: `t` is mutably borrowed (advance) while `first` is live.
    let second = t.current_token();
    (first, second)
}
```
