## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Display Delegates to Wrong Field
// ------------------------------------------------------------------------

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UserId(pub u64);

impl fmt::Display for UserId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // CHANGE 1: was `write!(f, "{:?}", self)` which invoked Debug on the whole struct, printing `UserId(42)`; switch to Display format on the inner field
        // CHANGE 2: access `self.0` directly so only the raw integer is rendered, not the wrapper type
        write!(f, "{}", self.0)
    }
}

pub fn format_log_line(user_id: UserId, message: &str) -> String {
    format!("[user={}] {}", user_id, message)
}
```

## Explanation

### Issue 1: Debug format used instead of Display

**Problem:** Every log line shows `UserId(42)` instead of `42`. The `Display` impl uses the `{:?}` format specifier, which invokes the `Debug` trait. `Debug` for a tuple struct prints the type name plus the inner value, e.g. `UserId(42)`, which is the wrong output for user-facing or log-embedded IDs.

**Fix:** Replace `"{:?}"` with `"{}"` in the `write!` call so that `fmt::Display` is used for the inner value, not `fmt::Debug`.

**Explanation:** The `{:?}` specifier calls `fmt::Debug::fmt`, which the `#[derive(Debug)]` macro implements as `UserId(inner_value)`. Using `{}` calls `fmt::Display::fmt` instead, which for `u64` just prints the number. There is also a latent danger in the original code: `write!(f, "{:?}", self)` passes `self` (the `UserId`) as the argument. Because `Display` would call `Debug` here (via `{:?}`), the compiler picks the derived `Debug` impl rather than looping back into `Display`, so it does not actually infinite-loop — but it still produces the wrong output. The fix avoids any ambiguity.

---

### Issue 2: `self` passed instead of `self.0`

**Problem:** Even if the format specifier were corrected to `{}`, passing `self` would still invoke `UserId`'s own `Display` impl recursively, causing a stack overflow at runtime. The intent is to render the wrapped integer, not the wrapper struct.

**Fix:** Change the argument in `write!` from `self` to `self.0`, which accesses the first (and only) field of the tuple struct directly — the raw `u64` value.

**Explanation:** `UserId` is a tuple struct, so its fields are accessed by index: `self.0` is the `u64` inside it. Passing `self` to a format macro with `{}` would call `UserId`'s `Display` impl again, looping until the stack overflows. Passing `self.0` gives the formatter a plain `u64`, whose `Display` impl prints just the number. The same pattern applies to `OrderId` and `ProductId` — every newtype wrapper with a `Display` impl should format `self.0` (or the named inner field) rather than `self`.
