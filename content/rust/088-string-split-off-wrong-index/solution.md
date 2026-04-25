## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — split_off Byte Index Not Char
// ------------------------------------------------------------------------

/// Truncates `s` in place to at most `max_chars` Unicode scalar values.
pub fn truncate_to_chars(s: &mut String, max_chars: usize) {
    // CHANGE 1: Removed the O(n) chars().count() pre-scan guard. Instead, we attempt to find the byte index of the max_chars-th character directly; if nth() returns None the string is already short enough and we return early without a second traversal.
    if let Some((byte_index, _)) = s.char_indices().nth(max_chars) {
        // CHANGE 2: Use truncate() instead of split_off() so we modify s in place without allocating a second String for the discarded tail; truncate() accepts any char-boundary index <= len, which char_indices() always produces.
        s.truncate(byte_index);
    }
}
```

## Explanation

### Issue 1: Redundant full-string scan before char_indices

**Problem:** The function calls `s.chars().count()` to decide whether to proceed, then calls `s.char_indices().nth(max_chars)` to find the split point. For a string with millions of characters, this means walking the entire UTF-8 byte sequence twice before doing anything useful. In the notification service this shows up as measurable CPU time on every display-name write.

**Fix:** Remove the `chars().count()` guard entirely. Replace it with a single `if let Some((byte_index, _)) = s.char_indices().nth(max_chars)` expression. When `nth` returns `None`, the string has fewer than `max_chars` characters and the function returns without touching `s`. When it returns `Some`, `byte_index` is the split point.

**Explanation:** `char_indices()` is a lazy iterator that yields `(byte_offset, char)` pairs. Calling `.nth(max_chars)` on it stops as soon as it reaches position `max_chars` (0-indexed), so it reads at most `max_chars + 1` characters. The old code forced a full scan with `chars().count()` even when the string was only slightly longer than `max_chars`. Eliminating the pre-scan cuts the work roughly in half for long strings and makes the logic a single coherent expression.

---

### Issue 2: split_off allocates an unnecessary String for the discarded tail

**Problem:** `s.split_off(byte_index)` splits the string at `byte_index`, returns the tail as a new `String`, and leaves the head in `s`. The returned `String` is immediately bound to `_tail` and dropped, so an allocation is made and freed for no reason. Under load, this creates extra heap pressure on every truncation call.

**Fix:** Replace `let _tail = s.split_off(byte_index);` with `s.truncate(byte_index);`. `truncate` sets the string's length to `byte_index` in place and does not allocate.

**Explanation:** `String::split_off` must allocate a new `String` to hold the bytes it removes, because it returns ownership of them to the caller. `String::truncate` simply updates the internal length field to `byte_index`, leaving the capacity unchanged and never touching the heap allocator. Both methods panic if the index is not on a UTF-8 character boundary, but since `char_indices()` always yields valid boundary offsets, neither call would actually panic with correct input. The only difference is the unnecessary allocation that `split_off` incurs.
