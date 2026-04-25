## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — UTF-8 Error Swallowed With Default
// ------------------------------------------------------------------------

// CHANGE 1+2: parse_body now returns Result<String, String> so invalid UTF-8 is surfaced as an error instead of silently replaced with replacement characters.
pub fn parse_body(bytes: &[u8]) -> Result<String, String> {
    // CHANGE 1: propagate the UTF-8 error instead of falling back to lossy decoding that corrupts data.
    std::str::from_utf8(bytes)
        .map(|s| s.to_owned())
        // CHANGE 2: include the error details in the returned Err so callers and logs can see what went wrong.
        .map_err(|e| format!("Invalid UTF-8 in request body: {}", e))
}

pub fn handle_webhook(raw_body: &[u8]) -> Result<serde_json::Value, String> {
    // CHANGE 1+2: propagate the Result from parse_body with ? so a bad encoding is a visible error, not silent corruption.
    let body = parse_body(raw_body)?;
    serde_json::from_str(&body).map_err(|e| e.to_string())
}
```

## Explanation

### Issue 1: Silent UTF-8 Corruption via Lossy Fallback

**Problem:** When `from_utf8` fails, the code falls back to `String::from_utf8_lossy`, which replaces every invalid byte sequence with the Unicode replacement character U+FFFD (`�`). The resulting string looks like text but has characters the sender never sent. When this mangled string reaches `serde_json::from_str`, it either parses to wrong data or fails with a JSON error, even though the raw bytes were a perfectly valid UTF-8 payload that just happened to arrive in a state that triggered a transient decode bug.

**Fix:** `parse_body` is changed to return `Result<String, String>`. The lossy fallback branch is removed entirely. `from_utf8` is called and its `Err` is converted to a `String` via `map_err`, so any decode failure becomes an explicit `Err` returned to the caller.

**Explanation:** `String::from_utf8_lossy` is designed for display purposes — it guarantees you always get *some* printable string, at the cost of accuracy. Using it in a data pipeline means bad bytes silently become `�`, which then flows into JSON parsing as if it were real content. The JSON parser may accept `�` as a valid character inside a string value, producing a parsed document that differs from what the sender intended, with no error raised anywhere in the stack. The fix refuses to proceed with corrupted data: if the bytes are not valid UTF-8, the whole webhook handling call returns an `Err`, which the HTTP layer can convert into a 400 response and log clearly.

---

### Issue 2: Error Information Discarded at Decode Site

**Problem:** The original `Err(_)` arm discards the `Utf8Error` value entirely. Operators see downstream JSON errors with no indication that the root cause was a bad encoding. The logs printed by the logger show garbled text (the replacement characters) instead of anything that points to a byte-level problem.

**Fix:** The `map_err` call in the updated `parse_body` formats the `Utf8Error` value `e` into a descriptive message: `format!("Invalid UTF-8 in request body: {}", e)`. In `handle_webhook`, the `?` operator propagates this message up as the `Err` variant of `Result<serde_json::Value, String>`.

**Explanation:** `Utf8Error` implements `Display` and reports the byte offset of the first invalid sequence, which is exactly the information needed to diagnose whether the problem is a truncated payload, a wrong content encoding header, or a genuine sender bug. By capturing it in the error string, every log line or HTTP 400 response body now contains the offset, making the failure immediately actionable. The `?` in `handle_webhook` ensures the error travels all the way to the HTTP response handler without any additional boilerplate.
