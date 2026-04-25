## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — String Slice at Non-Char Boundary
// ------------------------------------------------------------------------

/// Truncates `s` to at most `max_bytes` bytes, preserving UTF-8 validity.
pub fn truncate_to_bytes(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    // CHANGE 1: Instead of slicing directly at `max_bytes` (which panics when the index is not a char boundary), walk backwards from `max_bytes` using `floor_char_boundary` to find the nearest byte index that IS a valid char boundary.
    let boundary = s.floor_char_boundary(max_bytes);
    // CHANGE 2: Slice at the safe boundary index rather than the raw `max_bytes` value, guaranteeing the returned slice is always valid UTF-8 and never panics.
    &s[..boundary]
}
```

## Explanation

### Issue 1: Direct slice panics at non-char boundary

**Problem:** When a user registers with a name that contains multi-byte characters (emoji, CJK, accented letters), `max_bytes` can land in the middle of a multi-byte UTF-8 sequence. Rust's slice operator `&s[..max_bytes]` panics with `byte index N is not a char boundary`, which crashes the request handler thread entirely.

**Fix:** Replace `&s[..max_bytes]` with a two-step operation: call `s.floor_char_boundary(max_bytes)` to get `boundary`, then slice with `&s[..boundary]`.

**Explanation:** UTF-8 encodes non-ASCII code points as sequences of 2–4 bytes. Only the first byte of each sequence is a "char boundary"; the continuation bytes are not. Rust's `str` indexing checks at runtime that both endpoints are char boundaries and panics if they are not — this is a safety guarantee, not a bug. `floor_char_boundary` (stable since Rust 1.65 on nightly, 1.74 on stable) scans leftward from the given index until it finds a byte that starts a character, so the resulting index is always safe to slice at. The returned string may be up to 3 bytes shorter than `max_bytes` when the cut falls inside a 4-byte character, but it will never exceed `max_bytes` and will always be valid UTF-8.

---

### Issue 2: Slicing at raw `max_bytes` instead of the computed boundary

**Problem:** Even after obtaining a safe boundary index, using the original `max_bytes` offset in the slice expression would still cause a panic. The boundary computation is only useful if the slice actually uses it.

**Fix:** The slice expression is changed from `&s[..max_bytes]` to `&s[..boundary]`, where `boundary` is the value returned by `floor_char_boundary`.

**Explanation:** `floor_char_boundary` returns a `usize` that is ≤ `max_bytes` and guaranteed to align with a char boundary. Passing the original `max_bytes` to the slice after computing `boundary` but ignoring it would reproduce the original panic. Storing the result in a named variable `boundary` and using that variable in the slice makes the intent explicit and ensures the safe value is the one actually applied. A related pitfall: do not use `ceil_char_boundary` here, because it could return an index *larger* than `max_bytes`, making the stored string exceed the database column width.
