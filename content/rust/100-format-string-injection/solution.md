## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — User-controlled format string passed directly to a logging macro enables log injection
// ------------------------------------------------------------------------
use std::collections::HashMap;

fn handle_request(headers: &HashMap<String, String>) {
    let user_agent = headers
        .get("User-Agent")
        .map(|s| s.as_str())
        .unwrap_or("unknown");

    // CHANGE 2: Strip ASCII control characters (including \r, \n, ESC) from the user-supplied value before logging to prevent log injection and terminal escape abuse.
    let sanitized_user_agent: String = user_agent
        .chars()
        .filter(|c| !c.is_ascii_control())
        .collect();

    // Audit log — sent to a centralized log aggregator
    // CHANGE 1: Use a format string literal with `{}` so the user-controlled value is always treated as data, never as a format specifier or raw log text.
    println!("{}", sanitized_user_agent);

    // ... rest of handler
}
```

## Explanation

### Issue 1: Format string passes user input directly

**Problem:** `println!(user_agent)` treats the User-Agent string as a Rust format string. An attacker who sends a User-Agent containing `{:?}` or similar Rust format specifiers will cause a panic at runtime. More critically, any newlines in the value are written verbatim to the log, letting an attacker append fabricated log lines that look legitimate to a log aggregator.

**Fix:** Replace `println!(user_agent)` with `println!("{}", sanitized_user_agent)`. The first argument is now a string literal, so the user-supplied value is always interpolated as data via the `{}` placeholder and never interpreted as format syntax.

**Explanation:** Rust's `println!` macro requires its first argument to be a string literal so the compiler can validate format specifiers at compile time. Passing a runtime `&str` directly compiles only because of a special-case (it is equivalent to `println!("{}", user_agent)` in older editions, but in newer editions it is flagged by the compiler). Even where it compiles, the intent is wrong: the value is data, not a format template. Using `println!("{}", value)` makes the separation explicit and is consistent with every other language's safe logging pattern of keeping format strings static.

---

### Issue 2: Control characters allow log injection

**Problem:** Even with a fixed format string, an attacker can send a User-Agent like `Mozilla/5.0\nINFO 2024-01-01 payment_processed amount=9999` to write an extra line to the audit log. Log aggregators that split on newlines will treat the injected text as a real log event, potentially fooling alerting rules or hiding malicious activity.

**Fix:** Before logging, filter the characters of `user_agent` with `.chars().filter(|c| !c.is_ascii_control()).collect::<String>()`, producing `sanitized_user_agent`. This removes `\n`, `\r`, ESC (`\x1b`), and every other ASCII control character from the value.

**Explanation:** Log injection works because log storage and analysis tools treat newline as a record separator. If the logged value contains a newline, the text after it becomes an independent log record indistinguishable from one written by the application. Filtering with `is_ascii_control()` removes all characters in the range `0x00–0x1F` and `0x7F`, which covers newlines, carriage returns, and ANSI escape sequences used in terminal-escape attacks. A related pitfall is Unicode direction-override characters (`\u{202E}` etc.); if your log viewer renders Unicode, consider also filtering non-printable Unicode categories, but control-character stripping addresses the most common attack surface.
