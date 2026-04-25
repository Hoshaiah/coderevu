## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Off-by-One After String Split
// ------------------------------------------------------------------------

// CHANGE 2: Return Result so callers can handle blank/comment/malformed lines instead of panicking.
pub fn parse_kv_line(line: &str) -> Result<(String, String), String> {
    // CHANGE 2: Reject blank lines and comment lines early with a descriptive error.
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return Err(format!("skipping non-data line: {:?}", line));
    }

    let parts: Vec<&str> = line.splitn(2, '=').collect();
    // CHANGE 1: Check that splitn produced two parts before indexing; return Err instead of panicking.
    if parts.len() < 2 {
        return Err(format!("missing '=' in config line: {:?}", line));
    }
    let key = parts[0].trim().to_owned();
    let value = parts[1].trim().to_owned();
    Ok((key, value))
}
```

## Explanation

### Issue 1: Unconditional Index Into Possibly-Short Vec

**Problem:** When a config line contains no `=` character, `line.splitn(2, '=')` returns a `Vec` with exactly one element. The very next line unconditionally accesses `parts[1]`, which panics with `index out of bounds: the len is 1 but the index is 1`. The service crashes on startup roughly once a week whenever a comment or blank line reaches this function.

**Fix:** After collecting `parts`, a length check `if parts.len() < 2` was added. If the check fails, the function returns `Err(...)` with a descriptive message instead of indexing `parts[1]`.

**Explanation:** `splitn(n, pat)` guarantees *at most* `n` pieces, but it can return fewer if the delimiter is absent. A line like `# comment` has no `=`, so `parts` has length 1. Accessing index 1 on a length-1 `Vec` is always an out-of-bounds panic in Rust — there is no undefined behavior, just a guaranteed crash. The fix gates the index access behind an explicit length check, turning a panic into a recoverable error that the call site can log and skip. A related pitfall: even with the guard, an empty key (`=VALUE`) or empty value (`KEY=`) is still accepted, which may or may not be intentional depending on your config spec.

---

### Issue 2: No Error Path for Blank and Comment Lines

**Problem:** The function signature `-> (String, String)` provides no way to signal that a line is not a key-value pair at all. The team added a doc comment saying callers must filter blank and comment lines, but nothing enforces this, so the filtering step is occasionally missed and the function panics (Issue 1) or returns a pair with an empty or `#`-prefixed key.

**Fix:** The return type was changed from `(String, String)` to `Result<(String, String), String>`. Two early-return guards were added at the top of the function: one for `trimmed.is_empty()` and one for `trimmed.starts_with('#')`, both returning `Err` with a human-readable message.

**Explanation:** Relying on caller discipline to pre-filter inputs is fragile — any new call site, or any change to the loop that feeds lines into this function, can reintroduce the bug. Making the function return `Result` moves the contract from a comment into the type system: the compiler forces every caller to handle the `Err` case. The early trim-and-check also prevents a `#KEY=VALUE` line (a commented-out setting) from being silently parsed as a key starting with `#`, which would be a subtle misconfiguration bug even if it did not panic.
