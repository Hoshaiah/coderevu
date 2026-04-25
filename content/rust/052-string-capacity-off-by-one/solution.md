## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — String Buffer Capacity Off-By-One
// ------------------------------------------------------------------------

pub fn build_csv_row(fields: &[&str], out: &mut String) {
    if fields.is_empty() {
        return;
    }

    // CHANGE 1: Use fields.len() - 1 for separators (commas between fields, not after each), and CHANGE 2: add 1 for the trailing newline so the total capacity is exact and no reallocation occurs.
    let capacity: usize = fields.iter().map(|f| f.len()).sum::<usize>() + (fields.len() - 1) + 1;
    out.reserve(capacity);

    let mut first = true;
    for field in fields {
        if !first {
            out.push(',');
        }
        out.push_str(field);
        first = false;
    }
    out.push('\n');
}
```

## Explanation

### Issue 1: Separator count off by one

**Problem:** The original code adds `fields.len()` to the capacity to account for commas between fields. For a slice of N fields there are only N-1 commas, so the reservation is one byte larger than needed for commas — but that extra byte is silently consumed by another missing term (the newline), leaving the buffer exactly one byte short and triggering a reallocation the moment `push('\n')` is called.

**Fix:** Replace `fields.len()` with `(fields.len() - 1)` at the capacity calculation site. This correctly counts the N-1 comma separators between N fields.

**Explanation:** Between N fields there are exactly N-1 boundaries where a comma is inserted. Writing `fields.len()` assumes N commas, which is one too many. In isolation that would over-allocate by one byte, but because the newline is also missing from the formula the two errors cancel out in the wrong direction: the reserved space comes out exactly one byte short. A mid-level engineer can verify this by tracing a two-field example: `"a", "b"` needs 1 (a) + 1 (comma) + 1 (b) + 1 (newline) = 4 bytes; the buggy formula gives 1+1+2 = 4 but without the newline's `+1`, so `push('\n')` forces a `realloc`. The fix changes the separator term to `fields.len() - 1`.

---

### Issue 2: Trailing newline not included in reserved capacity

**Problem:** `build_csv_row` always appends a newline with `out.push('\n')` at the end, but the capacity formula never reserves a byte for it. Even after fixing the separator count, the buffer is one byte short and the allocator must resize to fit the newline.

**Fix:** Add `+ 1` to the capacity expression alongside the corrected separator term, giving `fields.iter().map(|f| f.len()).sum::<usize>() + (fields.len() - 1) + 1`. The final `+ 1` accounts for the newline byte.

**Explanation:** `String::reserve` ensures at least that many additional bytes are available beyond the string's current length. If the formula does not include every byte that will be written, the first write that exceeds the reserved space triggers a `realloc`. Since `push('\n')` is unconditional and always writes one byte, that byte must be part of the capacity estimate. The fix makes the formula match the actual output size byte-for-byte, so `out.reserve(capacity)` is the only allocation and no reallocation occurs.
