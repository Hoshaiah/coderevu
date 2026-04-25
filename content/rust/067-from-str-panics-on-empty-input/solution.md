## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — FromStr Panics on Empty Input
// ------------------------------------------------------------------------

use std::str::FromStr;
use std::fmt;

#[derive(Debug, PartialEq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug)]
pub struct ParseColorError(String);

// CHANGE 2: Add Display impl so ParseColorError satisfies fmt::Display, enabling std::error::Error and clap/serde integration.
impl fmt::Display for ParseColorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid color: {}", self.0)
    }
}

impl std::error::Error for ParseColorError {}

impl FromStr for Color {
    type Err = ParseColorError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        // Expect format "#rrggbb"
        // CHANGE 1: Replace .unwrap() with ok_or_else so missing '#' prefix returns Err instead of panicking.
        let hex = s.strip_prefix('#')
            .ok_or_else(|| ParseColorError(format!("expected leading '#', got {:?}", s)))?;
        if hex.len() != 6 {
            return Err(ParseColorError(format!("expected 6 hex digits, got {}", hex.len())));
        }
        let r = u8::from_str_radix(&hex[0..2], 16)
            .map_err(|e| ParseColorError(e.to_string()))?;
        let g = u8::from_str_radix(&hex[2..4], 16)
            .map_err(|e| ParseColorError(e.to_string()))?;
        let b = u8::from_str_radix(&hex[4..6], 16)
            .map_err(|e| ParseColorError(e.to_string()))?;
        Ok(Color { r, g, b })
    }
}
```

## Explanation

### Issue 1: `unwrap()` Panics on Missing Prefix

**Problem:** When `from_str` receives an empty string or any string that does not begin with `'#'`, `strip_prefix('#')` returns `None`, and the immediately following `.unwrap()` panics with `called 'Option::unwrap()' on a 'None' value`. The caller (clap, serde, or direct code) gets a process abort instead of a recoverable `Err`.

**Fix:** Replace `.unwrap()` with `.ok_or_else(|| ParseColorError(...))` followed by `?`. When `strip_prefix` returns `None`, `ok_or_else` converts it to an `Err(ParseColorError(...))` and `?` propagates it out of `from_str` as a normal error return.

**Explanation:** `str::strip_prefix` returns `Option<&str>`: `Some(&str)` when the prefix is found, `None` otherwise. Calling `.unwrap()` on `None` unconditionally panics — there is no recovery path. Using `.ok_or_else` converts the `None` case into the function's `Err` variant, which is the correct contract for `FromStr`. The existing length check (`hex.len() != 6`) already handles strings like `"#abc"`, but it never runs for inputs without `'#'` because the panic happens first. After the fix, an empty string `""` hits the new error, a bare `"ff8800"` also hits it, and only `"#rrggbb"`-shaped strings reach the length and radix checks.

---

### Issue 2: `ParseColorError` Lacks `Display` and `std::error::Error`

**Problem:** `ParseColorError` derives only `Debug` and has no `fmt::Display` implementation. Tools like `clap` and `serde` require error types to implement `std::error::Error`, which in turn requires `fmt::Display`. Without it the code may fail to compile when integrated with those crates, or produce unhelpful error messages.

**Fix:** Add `impl fmt::Display for ParseColorError` that writes the inner string to the formatter, then add a blanket `impl std::error::Error for ParseColorError {}`. Both are added just above the `FromStr` implementation.

**Explanation:** The `std::error::Error` trait has two supertraits: `Debug` (already satisfied) and `fmt::Display` (was missing). Without `Display`, you cannot write `impl std::error::Error for ParseColorError`, and without that, the error type cannot be used anywhere an `Error` trait object or generic bound is required — including `clap`'s `FromStr`-based argument parsing and `serde`'s error conversion utilities. Adding the `Display` impl with a human-readable message also improves the experience for end users who see the error in a terminal.
