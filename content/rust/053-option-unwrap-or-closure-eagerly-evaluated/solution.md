## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Eager Evaluation in unwrap_or
// ------------------------------------------------------------------------

use std::env;

fn db_lookup(key: &str) -> String {
    // Simulates an expensive database call
    println!("[db] fetching key: {}", key);
    String::from("30")
}

pub fn get_config_value(key: &str) -> String {
    // CHANGE 1: Replace unwrap_or with unwrap_or_else so db_lookup is only called lazily when env::var returns Err, not on every invocation.
    // CHANGE 2: The closure receives the error value, making it straightforward to log or inspect why the env var was absent if needed.
    env::var(key)
        .unwrap_or_else(|_e| db_lookup(key))
}
```

## Explanation

### Issue 1: Eager Evaluation of Fallback Argument

**Problem:** `db_lookup` is called on every request regardless of whether `env::var` returns `Ok` or `Err`. Operators see the database hit on every request and a consistent 40 ms latency overhead even though the environment variable is set.

**Fix:** Replace `unwrap_or(db_lookup(key))` with `unwrap_or_else(|_e| db_lookup(key))`. The argument is now a closure that Rust only calls when the `Result` is actually `Err`.

**Explanation:** Rust evaluates function arguments before the function is called — this is standard eager evaluation. When you write `unwrap_or(db_lookup(key))`, Rust evaluates `db_lookup(key)` first to produce a `String`, then passes that `String` to `unwrap_or`. The `Ok` branch never gets a chance to short-circuit the call. `unwrap_or_else` takes a closure instead, so the body of the closure runs only when `unwrap_or_else` internally determines the value is `Err`. The same pattern applies to `ok_or` vs `ok_or_else`, `unwrap_or_default` (which takes no argument and is always safe), and `map_or` vs `map_or_else`.

---

### Issue 2: Error Value Silently Discarded

**Problem:** The original code uses `unwrap_or`, which gives no access to the `Err` variant. If `env::var` fails for an unexpected reason (e.g., the variable exists but contains non-UTF-8 bytes), there is no way to distinguish that from the variable simply being absent.

**Fix:** `unwrap_or_else(|_e| db_lookup(key))` receives the error as `_e` inside the closure. The underscore prefix suppresses the unused-variable warning while still making the error accessible for logging or matching if the caller later wants to add diagnostics.

**Explanation:** `std::env::var` returns `Err(VarError::NotPresent)` when the variable is missing and `Err(VarError::NotUnicode(...))` when the value cannot be decoded as UTF-8. Silently falling back to the database in the Unicode-error case could mask a misconfiguration — an operator sets the variable but uses a shell that introduces a bad byte, and the code behaves as if the variable were absent. Having `_e` available in the closure means a single `eprintln!` or tracing call can surface which error path was taken without restructuring the function further.
