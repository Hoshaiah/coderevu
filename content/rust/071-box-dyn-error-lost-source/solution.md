## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Error Source Chain Broken
// ------------------------------------------------------------------------

use std::fmt;

#[derive(Debug)]
pub struct ClientError {
    pub message: String,
    // CHANGE 1: store cause as a boxed Error trait object instead of a String so the original error is preserved.
    pub cause: Box<dyn std::error::Error + 'static>,
}

impl fmt::Display for ClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.message, self.cause)
    }
}

impl std::error::Error for ClientError {
    // CHANGE 2: override source() to return the boxed cause so callers can walk the error chain.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(self.cause.as_ref())
    }
}

pub fn wrap_error(msg: &str, err: impl std::error::Error + 'static) -> ClientError {
    ClientError {
        message: msg.to_string(),
        // CHANGE 1: box the original error instead of converting it to a String, preserving full chain info.
        cause: Box::new(err),
    }
}
```

## Explanation

### Issue 1: Cause Stored as String Loses Error Object

**Problem:** When `wrap_error` calls `err.to_string()` and stores the result in a `String` field, the original error value is dropped. Operators see `ClientError` in logs but the underlying `serde_json::Error` or `hyper::Error` — and any errors chained beneath it — are gone permanently.

**Fix:** Change the `cause` field type from `String` to `Box<dyn std::error::Error + 'static>`, and in `wrap_error` replace `err.to_string()` with `Box::new(err)` to move the original error into the struct.

**Explanation:** `std::error::Error::source()` is supposed to return a reference to the next error in the chain. That reference must point to a live error object. Once you call `.to_string()` the object is consumed and only its formatted text survives — you can never reconstruct the original type or its own `source()` pointer from that string. Boxing the error with `Box<dyn std::error::Error + 'static>` keeps the full value alive inside `ClientError` for the lifetime of that struct. The `'static` bound is required because callers of `source()` hold only a shared reference with no lifetime annotation, so the compiler needs a guarantee the error outlives any borrow.

---

### Issue 2: source() Not Overridden Returns None

**Problem:** The `impl std::error::Error for ClientError` block is empty, so it inherits the default implementation of `source()`, which unconditionally returns `None`. Every tool or middleware that walks the error chain — including structured loggers and alerting dashboards — stops at `ClientError` and never sees what caused it.

**Fix:** Add a `source()` method to the `impl std::error::Error for ClientError` block that returns `Some(self.cause.as_ref())`, converting the `Box<dyn Error>` to a plain trait-object reference.

**Explanation:** The `std::error::Error` trait defines `source()` with a default body of `return None`. Any impl that does not override it silently hides its cause. After Issue 1's fix stores the cause as a `Box<dyn Error + 'static>`, overriding `source()` to call `self.cause.as_ref()` exposes that stored value as an `&dyn Error`. Log frameworks like `tracing` and error-chain walkers call `source()` in a loop — `err.source().and_then(|e| e.source())` — so every level in the chain must override `source()` correctly for the full chain to be visible. If you only fix the storage type but not the `source()` override, the root cause is stored but still invisible to callers.
