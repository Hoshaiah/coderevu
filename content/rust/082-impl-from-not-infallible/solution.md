## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Panicking Logic Inside From Impl
// ------------------------------------------------------------------------

use std::fmt;
use std::num::ParseIntError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UserId(u64);

impl UserId {
    pub fn value(self) -> u64 { self.0 }
}

// CHANGE 1: Replace the panicking From impl with TryFrom so callers get a Result instead of a crash on bad input.
#[derive(Debug)]
pub enum UserIdError {
    ParseError(ParseIntError),
    Zero,
}

impl fmt::Display for UserIdError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UserIdError::ParseError(e) => write!(f, "user id parse error: {}", e),
            UserIdError::Zero => write!(f, "user id must be non-zero"),
        }
    }
}

impl From<ParseIntError> for UserIdError {
    fn from(e: ParseIntError) -> Self { UserIdError::ParseError(e) }
}

// CHANGE 1: TryFrom<&str> returns Result<UserId, UserIdError> so invalid or zero input is an Err, not a panic.
impl TryFrom<&str> for UserId {
    type Error = UserIdError;

    fn try_from(s: &str) -> Result<Self, Self::Error> {
        let n: u64 = s.parse().map_err(UserIdError::ParseError)?;
        if n == 0 {
            return Err(UserIdError::Zero);
        }
        Ok(UserId(n))
    }
}

// CHANGE 2: parse_user_id now returns Result so the caller can handle errors rather than absorbing a hidden panic.
pub fn parse_user_id(s: &str) -> Result<UserId, UserIdError> {
    UserId::try_from(s)
}
```

## Explanation

### Issue 1: `From` impl panics on bad input

**Problem:** `From<&str> for UserId` calls `expect` and then `panic!` when the input string is not a valid non-zero integer. Because JSON deserialization calls this conversion with untrusted API data, sending `"user_id": "0"` (or any non-numeric string) terminates the process. The service crashes roughly once per day because at least one client consistently sends zero.

**Fix:** Remove the `From<&str>` impl entirely and replace it with a `TryFrom<&str>` impl whose associated `Error` type is `UserIdError`. The `try_from` method returns `Ok(UserId(n))` on success and `Err(UserIdError::Zero)` or `Err(UserIdError::ParseError(...))` on failure — no panics.

**Explanation:** The `From` trait is documented to represent infallible conversions. When you put fallible logic inside `From`, you have no way to signal failure except by panicking, because the return type is `Self`, not `Result<Self, E>`. `TryFrom` exists precisely for conversions that can fail: it returns `Result<Self, Self::Error>`, so the caller decides what to do with an invalid value. With the `TryFrom` impl in place, the deserialization layer receives an `Err` variant and can return an HTTP 400 instead of crashing. A related pitfall: any `.into()` call site that relied on `From<&str>` will now fail to compile, which is the correct outcome — it forces each caller to acknowledge the fallibility.

---

### Issue 2: `parse_user_id` hides the panic behind a value-returning signature

**Problem:** `parse_user_id` returns `UserId` (not `Result`), so every call site assumes the conversion always succeeds. The function body calls `.into()` which invokes the panicking `From` impl, meaning the error-handling responsibility is silently dropped rather than propagated.

**Fix:** Change `parse_user_id` to return `Result<UserId, UserIdError>` and replace the body with `UserId::try_from(s)`. This matches the new `TryFrom` impl and forces call sites to handle the `Err` case explicitly.

**Explanation:** A function that returns a plain value signals to callers that it cannot fail. When the implementation inside can panic, callers never write error-handling code because the type signature gives them no reason to. Changing the return type to `Result` propagates the fallibility upward until it reaches a layer — such as an HTTP handler — that can translate it into a proper error response. If you leave `parse_user_id` returning `UserId` even after fixing `From`, callers would need to use `unwrap` or `expect` themselves, which recreates the same panic risk one level up.
