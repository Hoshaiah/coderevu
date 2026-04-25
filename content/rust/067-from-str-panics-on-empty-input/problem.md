---
slug: from-str-panics-on-empty-input
track: rust
orderIndex: 67
title: FromStr Panics on Empty Input
difficulty: easy
tags:
  - errors
  - parsing
  - correctness
language: rust
---

## Context

`src/config/color.rs` provides a `Color` type parsed from CSS-style hex strings (`"#ff8800"`) in configuration files. The `FromStr` implementation is used by a `serde` deserializer and also called directly when parsing command-line flags with `clap`. It was written to handle the happy path and has been in production for a year without issues.

After adding a new optional `--highlight-color` flag that can receive an empty string as a sentinel value meaning "use the default", the binary started panicking in CI with `called \'Option::unwrap()\' on a \'None\' value` on inputs that are empty strings or strings shorter than 7 characters. The panic occurs inside `Color::from_str`.

The team confirmed that passing a non-empty but malformed hex string such as `"xyz"` returns an `Err` correctly, because the `u8::from_str_radix` call fails. The panic only manifests on inputs shorter than 7 bytes.

## Buggy code

```rust
use std::str::FromStr;

#[derive(Debug, PartialEq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug)]
pub struct ParseColorError(String);

impl FromStr for Color {
    type Err = ParseColorError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // Expect format "#rrggbb"
        let hex = s.strip_prefix('#').unwrap();
        if hex.len() != 6 {
            return Err(ParseColorError(format!("expected 6 hex digits, got {}", hex.len())));
        }
        let r = u8::from_str_radix(&hex[0..2], 16)
            .map_err(|e| ParseColorError(e.to_string()))?;
        let g = u8::from_str_radix(&hex[2..4], 16)
            .map_err(|e| ParseColorError(e.to_string()))?;
        let b = u8::from_str_radix(&hex[4..6], 16)
            .map_err(|e| ParseColorError(e.to_string()))?;
        Ok(Color { r, g, b })
    }
}
```
