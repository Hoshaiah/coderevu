---
slug: iter-peekable-peek-skips-element
track: rust
orderIndex: 85
title: "Peekable::peek Advances Iterator"
difficulty: medium
tags: ["errors", "iterator", "correctness", "parsing"]
language: rust
---

## Context

`src/lexer/scanner.rs` is a hand-written lexer for a small expression language. It uses a `Peekable` iterator over the bytes of the input to scan tokens without consuming lookahead characters unnecessarily. The `scan_number` method is called when the outer scanner sees a digit and wants to collect all consecutive digit bytes into a number token.

Users report that multi-digit numbers parsed by the expression evaluator are sometimes missing their first digit. For example, the expression `"123 + 4"` is evaluated as `23 + 4 = 27` instead of `127`. Single-digit numbers and the first digit of a number at the very start of the input are unaffected when there is no character before the number in the stream.

Adding tracing confirmed that `scan_number` is receiving the iterator positioned at the first digit, and the first call inside `scan_number` is intended to be a non-consuming peek to decide whether to enter the loop.

## Buggy code

```rust
pub fn scan_number<I>(iter: &mut std::iter::Peekable<I>) -> u64
where
    I: Iterator<Item = u8>,
{
    let mut result: u64 = 0;
    // Keep consuming digits as long as the next byte is a digit.
    while let Some(&b) = iter.peek() {
        if b.is_ascii_digit() {
            iter.next(); // consume the peeked digit
            result = result * 10 + (b - b'0') as u64;
        } else {
            break;
        }
    }
    result
}

pub fn tokenize(input: &str) -> Vec<u64> {
    let mut numbers = Vec::new();
    let mut iter = input.bytes().peekable();
    while let Some(&b) = iter.peek() {
        if b.is_ascii_digit() {
            iter.next(); // consume the digit before calling scan_number
            numbers.push(scan_number(&mut iter));
        } else {
            iter.next();
        }
    }
    numbers
}
```
