## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Display Calls Itself Recursively
// ------------------------------------------------------------------------

use std::fmt;

pub struct AppError {
    pub code: u32,
    pub message: String,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // CHANGE 1: Replace `self` with `self.message` so fmt delegates to the inner String instead of calling Display on AppError again.
        write!(f, "error {}: {}", self.code, self.message)
    }
}

impl fmt::Debug for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "AppError {{ code: {}, message: {:?} }}", self.code, self.message)
    }
}
```

## Explanation

### Issue 1: Display Recurses Into Itself via `self`

**Problem:** Any code path that formats an `AppError` for logging crashes the process with a stack overflow. `RUST_BACKTRACE=1` shows hundreds of identical `<AppError as Display>::fmt` frames. The crash happens at serialisation time, not construction time, so it can be hard to reproduce in unit tests that never log errors.

**Fix:** In `Display::fmt`, replace the format argument `self` with `self.message`. The fixed line is `write!(f, "error {}: {}", self.code, self.message)`, which formats the inner `String` directly instead of re-entering `AppError`'s `Display` impl.

**Explanation:** When `write!(f, "...", self)` is called, the `{}` placeholder invokes the `Display` trait on the argument. The argument is `self`, which is an `&AppError`. Rust resolves `Display` for `AppError` and calls `fmt` again — which calls `write!` with `self` again — and so on without any base case. The `String` type's `Display` impl just writes the string's bytes and returns, so using `self.message` breaks the cycle. A related pitfall: if you ever add a newtype wrapper around `AppError` and delegate its `Display` to the inner type with `{}`, you can recreate this bug across two types instead of one, which is harder to spot in a backtrace.

---
