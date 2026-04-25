## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Truncate Panics on Multibyte Char
// ------------------------------------------------------------------------

/// Clips `name` to at most `max_bytes` bytes.
/// The returned string is always valid UTF-8.
pub fn truncate_display_name(name: &str, max_bytes: usize) -> &str {
    if name.len() <= max_bytes {
        return name;
    }
    // CHANGE 1: Use char_indices to find the largest char boundary that fits within max_bytes, instead of slicing directly at max_bytes which panics when that offset is inside a multibyte character.
    let boundary = name
        .char_indices()
        .map(|(i, c)| i + c.len_utf8())
        .take_while(|&end| end <= max_bytes)
        .last()
        .unwrap_or(0);
    // CHANGE 2: Slice at the computed safe char boundary rather than raw max_bytes, guaranteeing valid UTF-8 and no panic.
    &name[..boundary]
}
```

## Explanation

### Issue 1: Byte-index slice panics on multibyte boundary

**Problem:** When a Japanese or Korean display name is passed in, `max_bytes` (16) can land in the middle of a 3-byte character like `の` (bytes 15–17). Rust's `str` indexing operator panics with `byte index 16 is not a char boundary` rather than producing a truncated string, crashing the request handler in production.

**Fix:** Replace `&name[..max_bytes]` with a slice at `boundary`, which is computed by `char_indices()` to be the last byte offset where a complete character ends at or before `max_bytes`. The old direct slice is removed and the new safe slice `&name[..boundary]` is used at CHANGE 2.

**Explanation:** Rust's `str` guarantees valid UTF-8 at all times and enforces this by panicking when you index at a non-char-boundary offset. A 3-byte character occupying bytes 15, 16, 17 means offset 16 is "inside" the character — not a valid boundary. `char_indices()` yields `(byte_offset, char)` pairs; adding `c.len_utf8()` to each offset gives the exclusive end byte of that character. `take_while(|&end| end <= max_bytes)` keeps only complete characters that fit, and `last()` gives the furthest safe cut point. `unwrap_or(0)` handles the edge case where even the first character is wider than `max_bytes`, returning an empty slice instead of panicking.

---

### Issue 2: Raw byte truncation silently corrupts UTF-8 in unsafe contexts

**Problem:** If Rust's bounds check were somehow bypassed (e.g., via `unsafe` or a future refactor using `from_utf8_unchecked`), slicing at an arbitrary byte offset would produce a `&str` whose final bytes are the interior of a multibyte sequence — invalid UTF-8. Downstream code that serializes or logs the name would emit garbage or trigger its own panics.

**Fix:** The computed `boundary` value at CHANGE 2 always points to a position immediately after a complete character, so the resulting slice is structurally valid UTF-8 regardless of how it is later consumed.

**Explanation:** UTF-8 encodes code points as 1–4 bytes where continuation bytes all have the pattern `10xxxxxx`. A slice that cuts mid-character ends with one or more continuation bytes that have no valid lead byte in front of them. Any code that iterates over chars or validates the string will reject or misinterpret it. By computing `boundary` from `char_indices`, every byte in `&name[..boundary]` belongs to a complete, well-formed code-point sequence, eliminating this class of corruption regardless of the call site.
