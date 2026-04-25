## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — FromStr Returns Infallible Error
// ------------------------------------------------------------------------

use std::str::FromStr;

#[derive(Debug, Default, PartialEq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug)]
pub struct ParseColorError(String);

impl std::fmt::Display for ParseColorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid color: {}", self.0)
    }
}

impl FromStr for Color {
    type Err = ParseColorError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let s = s.strip_prefix('#').unwrap_or(s);
        if s.len() != 6 {
            // CHANGE 1: return Err instead of Ok(Color::default()) so callers actually see the failure
            return Err(ParseColorError(format!("expected 6 hex digits, got {}", s)));
        }
        // CHANGE 2: propagate hex-digit parse errors with map_err+? instead of silently defaulting to 0
        let r = u8::from_str_radix(&s[0..2], 16)
            .map_err(|e| ParseColorError(format!("invalid red component: {}", e)))?;
        // CHANGE 2: same fix for the green component
        let g = u8::from_str_radix(&s[2..4], 16)
            .map_err(|e| ParseColorError(format!("invalid green component: {}", e)))?;
        // CHANGE 2: same fix for the blue component
        let b = u8::from_str_radix(&s[4..6], 16)
            .map_err(|e| ParseColorError(format!("invalid blue component: {}", e)))?;
        Ok(Color { r, g, b })
    }
}
```

## Explanation

### Issue 1: Wrong-length input returns Ok instead of Err

**Problem:** When the hex string is not exactly 6 characters (e.g. `#abc`), the function returns `Ok(Color { r: 0, g: 0, b: 0 })`. Any caller using `?` on the result never sees a failure; it silently gets a black color and continues execution as if nothing went wrong.

**Fix:** Replace `return Ok(Color::default())` with `return Err(ParseColorError(format!("expected 6 hex digits, got {}", s)))` at the length-check branch. This is the CHANGE 1 site.

**Explanation:** `FromStr::from_str` signals a bad input by returning the `Err` variant of `Result`. Returning `Ok` with a default value is semantically "parsing succeeded and the result is a black color", which is not what the code intends. The `?` operator in calling code only short-circuits on `Err`; an `Ok` value passes straight through. Any user who relies on `?` or `match`-es the error variant will never detect that the string was malformed. Returning `Err` with a descriptive message lets the caller handle or surface the problem.

---

### Issue 2: Invalid hex digits silently coerced to 0

**Problem:** For input like `#zzzzzz`, `u8::from_str_radix` fails, but `.unwrap_or(0)` discards the error and substitutes `0` for each component. The caller receives `Ok(Color { r: 0, g: 0, b: 0 })` — a black color — with no indication that the digits were invalid.

**Fix:** Replace `.unwrap_or(0)` with `.map_err(|e| ParseColorError(...))?` on each of the three component parses. This converts the library error into a `ParseColorError` and immediately returns it from `from_str` via `?`. These are the CHANGE 2 sites.

**Explanation:** `u8::from_str_radix` returns a `Result`; `.unwrap_or(0)` throws away the `Err` branch and replaces it with a sentinel value. That pattern is sometimes useful for genuinely optional parsing, but here the intent is strict validation. Using `.map_err` wraps the underlying `ParseIntError` in the domain error type `ParseColorError`, and `?` then propagates it up to the caller. A related pitfall: if you used `.unwrap()` instead of `.unwrap_or(0)`, the function would panic on invalid input rather than return a clean error, which is equally wrong.
