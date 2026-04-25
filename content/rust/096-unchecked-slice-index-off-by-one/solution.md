## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — CSV column parser panics with index-out-of-bounds on rows with a trailing comma
// ------------------------------------------------------------------------
pub fn extract_columns(line: &str, indices: &[usize]) -> Vec<String> {
    // CHANGE 2: strip a trailing comma before splitting so that "a,b," does not produce a spurious empty final field that inflates the column count and causes callers to receive empty strings for the phantom column.
    let normalized = line.trim_end_matches(',');
    let columns: Vec<&str> = normalized.split(',').collect();
    // CHANGE 1: use .get(i) instead of direct indexing so that a missing column returns an empty string rather than panicking with index-out-of-bounds.
    indices.iter().map(|&i| columns.get(i).map(|s| s.trim().to_string()).unwrap_or_default()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic() {
        let result = extract_columns("alice,30,engineer", &[0, 2]);
        assert_eq!(result, vec!["alice", "engineer"]);
    }

    #[test]
    fn trailing_comma_no_panic() {
        // A row exported by Excel with a trailing comma should not panic.
        let result = extract_columns("alice,30,engineer,", &[0, 2]);
        assert_eq!(result, vec!["alice", "engineer"]);
    }

    #[test]
    fn out_of_bounds_index_returns_empty() {
        // Requesting a column that does not exist returns an empty string,
        // not a panic.
        let result = extract_columns("alice,30", &[0, 5]);
        assert_eq!(result, vec!["alice", ""]);
    }
}
```

## Explanation

### Issue 1: Out-of-bounds panic on missing columns

**Problem:** When an index in `indices` is larger than the last valid position in `columns`, the expression `columns[i]` panics with an index-out-of-bounds at runtime. In production this kills the request (or the whole thread) with no graceful error. Any row shorter than the caller expects — including rows with a trailing comma that are then indexed beyond what exists — triggers this.

**Fix:** Replace `columns[i]` with `columns.get(i).map(|s| s.trim().to_string()).unwrap_or_default()`. `get` returns `Option<&&str>` and `unwrap_or_default` substitutes an empty `String` when the index is absent.

**Explanation:** Rust's slice indexing operator `[]` performs a bounds check and panics on failure; there is no implicit "return nil" like in some other languages. `Vec::get` does the same bounds check but returns `None` instead of panicking, letting the caller decide what to do. Using `unwrap_or_default` means a missing column produces `""` rather than crashing, which is the right trade-off for a data-ingest pipeline where a malformed row should be logged and skipped, not be fatal. A related pitfall: if you later want to distinguish "column missing" from "column present but empty", keep the `Option` and handle both arms explicitly instead of collapsing with `unwrap_or_default`.

---

### Issue 2: Trailing comma creates spurious empty field

**Problem:** `"alice,30,engineer,".split(',')` produces four elements: `["alice", "30", "engineer", ""]`. The fourth element is an empty string that does not correspond to any real data. If the caller requests index 3, it silently gets `""` instead of an error, which can corrupt downstream records or cause subtle data-quality bugs.

**Fix:** Before splitting, call `line.trim_end_matches(',')` and split the result stored in `normalized`. This removes one or more trailing commas so `"alice,30,engineer,"` becomes `"alice,30,engineer"` before the split.

**Explanation:** `str::split` in Rust produces an element for every gap between delimiters, including the gap between the final comma and the end of the string. This is well-defined behavior, but it surprises callers who treat a trailing comma as a no-op. `trim_end_matches(',')` removes all consecutive trailing commas (two or more are also valid in some broken exports) before the split happens, so the resulting slice length exactly matches the number of real data fields. Note that `trim_end_matches` takes a pattern, not a count, so it removes every trailing comma; if you only want to strip exactly one, use `strip_suffix(',').unwrap_or(line)` instead.
