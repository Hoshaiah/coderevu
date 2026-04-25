## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Peekable::peek Advances Iterator
// ------------------------------------------------------------------------

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
            // CHANGE 1: Do NOT call iter.next() here; scan_number uses peek()+next() internally and must see the first digit itself.
            numbers.push(scan_number(&mut iter));
        } else {
            iter.next();
        }
    }
    numbers
}
```

## Explanation

### Issue 1: First digit consumed before scan_number sees it

**Problem:** When `tokenize` detects a digit with `iter.peek()`, it immediately calls `iter.next()` to advance past that byte, then calls `scan_number`. `scan_number` starts its own `peek()`-based loop and therefore never sees the first digit. For the number `123`, `scan_number` receives the iterator positioned at `2`, so it builds `23` and the `1` is silently dropped.

**Fix:** Remove the `iter.next()` call in the `if b.is_ascii_digit()` branch of `tokenize` (the `// CHANGE 1` site). `scan_number` already uses `peek()` followed by `next()` in its loop, so it both inspects and consumes every digit, including the first one.

**Explanation:** `Peekable::peek` looks at the next item without consuming it; only `next()` advances the iterator. `tokenize` used `peek()` correctly to decide which branch to take, but then incorrectly called `next()` to "confirm" the choice, consuming the very byte it intended to hand off. `scan_number` was designed to own the full number from the first digit onward — its loop calls `peek()` to check, then `next()` to consume, so it handles the first digit correctly when the iterator is still pointing at it. The fix is to let `scan_number` do its job without the caller pre-consuming anything. A related pitfall: if you ever refactor `scan_number` to accept the already-consumed first digit as a parameter, you must also restore the `iter.next()` call in `tokenize`, otherwise the first digit is processed twice.

---
