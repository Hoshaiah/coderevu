## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — zip Silently Drops Trailing Elements
// ------------------------------------------------------------------------

fun buildRowMap(headers: List<String>, values: List<String>): Map<String, String> {
    require(headers.size == values.size) {
        "Header count (${headers.size}) must match value count (${values.size})"
    }
    // CHANGE 2: Replace zip (truncates silently to shortest list) with an index-driven loop so any future size divergence throws rather than dropping trailing entries.
    return headers.indices.associate { i -> headers[i] to values[i] }
}

fun parseRows(headerLine: String, dataLines: List<String>): List<Map<String, String>> {
    // CHANGE 1: Use a limit of -1 so that trailing empty tokens (e.g. a final comma producing a blank field) are preserved instead of being dropped by the default split behavior.
    val headers = headerLine.split(",", limit = -1)
    return dataLines.map { line ->
        // CHANGE 1: Same fix applied to value lines so the element count matches the header count even when trailing fields are empty.
        val values = line.split(",", limit = -1)
        buildRowMap(headers, values)
    }
}
```

## Explanation

### Issue 1: `split` Drops Trailing Empty Fields

**Problem:** When a CSV line ends with a comma (an empty trailing field), Kotlin's `String.split(",")` without a `limit` argument discards all trailing empty strings. So a 12-column line like `a,b,...,k,` produces only 11 tokens, not 12. The `require` check then either fires (if headers still has 12) or is bypassed (if the header line had the same problem), and the last column silently disappears from the resulting map.

**Fix:** Pass `limit = -1` to every `split(",")` call (both in `headerLine.split` and `line.split` inside `parseRows`). This matches the `CHANGE 1` sites.

**Explanation:** Kotlin delegates `String.split` to Java's `String.split(regex, limit)`. When `limit` is 0 (the default), Java discards all trailing empty strings from the result array. Setting `limit` to a negative value disables that trimming and keeps every token including empty ones at the end. A 12-column line that ends with a comma will now correctly produce 12 tokens, the last being an empty string, which maps correctly to the last header key. The same rule applies to the header line itself — if the vendor ever sends a header row with a trailing comma, the fix keeps the token count consistent on both sides.

---

### Issue 2: `zip` Truncates to the Shorter List Without Warning

**Problem:** `zip` stops at the end of the shorter of the two lists and silently discards the remaining elements of the longer one. If `headers` has 12 entries and `values` has 10, the result map has only 10 entries — no exception, no log, no indication anything was lost.

**Fix:** Replace `headers.zip(values).toMap()` with `headers.indices.associate { i -> headers[i] to values[i] }` as shown at `CHANGE 2`. Because both lists are indexed with the same range, any real length mismatch that somehow passes the `require` check will throw an `IndexOutOfBoundsException` on `values[i]` instead of silently truncating.

**Explanation:** `zip` is designed for the case where you intentionally want to pair as many elements as both lists share, which is useful for merging streams of different lengths. Here that behavior is a bug: every column must be present. The `associate` approach iterates over `headers.indices` (0 until `headers.size`) and accesses `values[i]` directly. If `values` is shorter, Kotlin throws immediately and the caller can see exactly which row is malformed. This also makes the `require` guard at the top of `buildRowMap` a useful early check rather than dead code — both defenses now pull in the same direction.
