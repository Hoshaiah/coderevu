## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — dedup Without Prior Sort Misses Dupes
// ------------------------------------------------------------------------

pub fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized: Vec<String> = tags
        .into_iter()
        .map(|t| t.to_lowercase())
        .collect();

    // CHANGE 1: Sort the vec before calling dedup so that all identical tags are adjacent; dedup only removes consecutive duplicates, so without this sort non-adjacent dupes survive.
    normalized.sort();
    // CHANGE 2: dedup now correctly removes all duplicates because the preceding sort guarantees every equal element is next to its twin.
    normalized.dedup();
    normalized
}
```

## Explanation

### Issue 1: dedup Requires Adjacent Duplicates

**Problem:** Users see the same tag appear twice (or more) in the UI. This happens whenever two identical tags are not next to each other in the input list — for example `["rust", "go", "rust"]`. Both `"rust"` entries survive and reach the database.

**Fix:** Add `normalized.sort();` immediately before the existing `normalized.dedup();` call. This is the `CHANGE 1` / `CHANGE 2` pair in the reference solution.

**Explanation:** `Vec::dedup` works by scanning the slice linearly and dropping an element only when it equals the element immediately before it. If two equal elements have anything between them, `dedup` never sees them as adjacent and keeps both. Sorting first moves all equal elements into contiguous runs, so `dedup` then removes every duplicate in a single linear pass. The unit tests passed before because every fixture happened to supply tags in sorted order, making duplicates adjacent by accident. A randomized input immediately exposes the gap between what `dedup` does and what callers expect it to do.

---

### Issue 2: Missing Sort Before Dedup Causes Intermittent Bug

**Problem:** The failure is intermittent — it depends entirely on the order tags arrive from user input. When a user adds `["rust", "webdev", "rust"]`, both copies of `"rust"` reach the database. When they add `["rust", "rust", "webdev"]`, only one copy survives. The same logical input produces different results depending on insertion order.

**Fix:** The `normalized.sort();` line added at `CHANGE 1` eliminates the order dependency by normalizing the sequence before deduplication runs.

**Explanation:** Because `dedup` is only correct after a sort, calling it on unsorted data creates a function whose output is non-deterministic from the caller's perspective — it depends on the accidental ordering of the input rather than the semantic content. Sorting is O(n log n) and for tag lists (typically a handful of short strings) this cost is negligible. One related pitfall: if you later want to preserve the original order for display purposes, collect into a `HashSet<String>` instead, which deduplicates without requiring a sort but also discards order entirely.
