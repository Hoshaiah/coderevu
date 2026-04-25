## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — From Impl Panics on Bad Input
// ------------------------------------------------------------------------

use std::convert::TryFrom;

#[derive(Debug, Clone, Copy)]
pub struct Port(u16);

impl Port {
    pub fn value(self) -> u16 {
        self.0
    }
}

// CHANGE 1: Replace `From<u16>` with `TryFrom<u16>` so that an invalid port returns Err instead of panicking, honouring the infallibility contract of `From`.
impl TryFrom<u16> for Port {
    type Error = String;

    fn try_from(n: u16) -> Result<Self, Self::Error> {
        if n == 0 {
            // CHANGE 1: Return Err with a descriptive message instead of panicking.
            return Err(String::from("port 0 is invalid: port numbers must be in the range 1–65535"));
        }
        Ok(Port(n))
    }
}

// CHANGE 2: Update `make_port` to return `Result<Port, String>` and use `try_from` so callers can handle invalid input without a crash.
pub fn make_port(raw: u16) -> Result<Port, String> {
    Port::try_from(raw)
}
```

## Explanation

### Issue 1: `From` impl panics on invalid input

**Problem:** When the application reads a port of `0` from config and calls `Port::from(0)`, the process panics immediately. The panic unwinds deep in the startup sequence, prints only a backtrace, and logs nothing useful. Operators see a crashed service with no actionable error message.

**Fix:** Remove the `impl From<u16> for Port` block entirely and replace it with `impl TryFrom<u16> for Port` (with `type Error = String`). The `try_from` method returns `Ok(Port(n))` for valid input and `Err(String::from("port 0 is invalid: ..."))` for port 0, eliminating the `panic!` call.

**Explanation:** The `From` trait is documented to be infallible — implementing it with a `panic!` inside violates that contract and surprises every caller that reasonably assumes `From` never fails. `TryFrom` exists specifically for conversions that can fail; its return type is `Result<T, E>`, which forces the caller to acknowledge the error. With `TryFrom` in place, the error surfaces at the call site as a `Result`, can be logged with context, and can be turned into a user-facing config validation message instead of a crash. A related pitfall: the `?` operator and combinators like `.map_err` only work on `Result`, so keeping this as `From` would block any ergonomic error-propagation pattern.

---

### Issue 2: `make_port` hides validation failure from callers

**Problem:** `make_port` returns a bare `Port` and calls `Port::from(raw)`. There is no way for the caller to know the conversion failed short of catching the panic (which is not idiomatic Rust). Any code path that goes through `make_port` with a zero port will crash rather than propagate an error.

**Fix:** Change the return type of `make_port` from `Port` to `Result<Port, String>` and replace `Port::from(raw)` with `Port::try_from(raw)`, which now returns the `Result` directly.

**Explanation:** Once `TryFrom` is implemented, `make_port` must reflect the fallibility in its own signature so callers can use `?` or `match` to handle the error. Returning a bare `Port` would require either panicking (the original bug) or silently discarding the error. With `Result<Port, String>` as the return type, the compiler enforces that every call site handles the failure case, and the descriptive `String` error message can be logged or shown to the operator exactly where the bad config was detected.
