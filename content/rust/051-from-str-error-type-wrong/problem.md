---
slug: from-str-error-type-wrong
track: rust
orderIndex: 51
title: FromStr Returns Infallible Error
difficulty: easy
tags:
  - errors
  - api-misuse
  - correctness
language: rust
---

## Context

In `src/types/color.rs`, a `Color` type implements `FromStr` so it can be parsed from configuration files and environment variables. The parser attempts to read a hex string like `#ff8800` and convert it into RGB components.

Users report that passing an invalid hex string like `#zzzzzz` or the wrong length like `#abc` silently produces a black color (`0, 0, 0`) instead of returning an error. The `?` operator in the calling code never triggers; parse errors are swallowed.

The developer implemented the error path using `return Ok(Color::default())` instead of `Err`, under the mistaken belief that returning a default was the right way to signal parse failure. The `Err` variant is never constructed anywhere in the function.

## Buggy code

```rust
use std::str::FromStr;

#[derive(Debug, Default, PartialEq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug)]
pub struct ParseColorError(String);

impl std::fmt::Display for ParseColorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid color: {}", self.0)
    }
}

impl FromStr for Color {
    type Err = ParseColorError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let s = s.strip_prefix('#').unwrap_or(s);
        if s.len() != 6 {
            // BUG: should be Err(...), not Ok(default)
            return Ok(Color::default());
        }
        let r = u8::from_str_radix(&s[0..2], 16)
            .unwrap_or(0);
        let g = u8::from_str_radix(&s[2..4], 16)
            .unwrap_or(0);
        let b = u8::from_str_radix(&s[4..6], 16)
            .unwrap_or(0);
        Ok(Color { r, g, b })
    }
}
```
