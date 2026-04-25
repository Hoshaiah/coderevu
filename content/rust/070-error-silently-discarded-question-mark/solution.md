## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Infallible Conversion Hides Error
// ------------------------------------------------------------------------

use std::num::ParseIntError;

#[derive(Debug)]
pub struct Record {
    pub id: u64,
    pub amount: i64,
}

pub fn parse_record(id_str: &str, amount_str: &str) -> Result<Record, ParseIntError> {
    let id: u64 = id_str.trim().parse()?;
    // CHANGE 1: Replace `.unwrap_or(0)` with `?` so a parse failure returns Err(ParseIntError) and the caller can skip/log the row instead of silently inserting 0.
    let amount: i64 = amount_str.trim().parse()?;
    Ok(Record { id, amount })
}
```

## Explanation

### Issue 1: `unwrap_or` Swallows Parse Error

**Problem:** When `amount_str` contains a non-numeric value like `"N/A"`, `.parse::<i64>()` returns `Err(ParseIntError)`. `.unwrap_or(0)` catches that error and substitutes `0`, so the function returns `Ok(Record { id, amount: 0 })`. The caller sees a successful parse and writes the record to the database. Downstream consumers then see spurious zeros that are indistinguishable from a legitimate zero amount.

**Fix:** Remove `.unwrap_or(0)` and append `?` so the expression becomes `amount_str.trim().parse()?`. This is the `CHANGE 1` site. When parsing fails, `?` immediately returns `Err(ParseIntError)` from `parse_record`, giving the caller the chance to log a warning and skip the row.

**Explanation:** The `?` operator is shorthand for "if this is `Err`, return it from the current function". `.unwrap_or(fallback)` is the opposite — it discards the `Err` branch and produces an `Ok`-compatible value, which means `?` never gets a chance to fire. The fix restores the intended control flow: a bad `amount` field now exits the function with an error, matching the same behaviour already applied to `id_str`. A related pitfall is `.unwrap_or_default()`, which has identical silent-failure semantics and would cause the same bug.

---

### Issue 2: Return Type Misrepresents Actual Error Propagation

**Problem:** The function signature `-> Result<Record, ParseIntError>` implies that any `ParseIntError` encountered inside will be returned to the caller. In the buggy code this is only true for the `id` field; the `amount` field's error is consumed internally. A developer reading the signature would reasonably assume both fields are validated, and a reviewer checking `?` usage would not spot the problem because the `amount` line never uses `?`.

**Fix:** The same `CHANGE 1` that adds `?` to the `amount` parse also makes the return type accurate. After the fix, both fields propagate their `ParseIntError` to the caller via `?`, so the signature truthfully describes the function's behaviour.

**Explanation:** Rust's type system enforces that the error type in the `Result` is correct, but it does not force every possible error inside the function to actually reach the `Err` variant — a developer can always intercept an error with combinators like `unwrap_or` before it propagates. The compiler sees no problem because the return type is still technically satisfiable. This makes logic bugs of this kind invisible to the type checker and easy to miss in review, especially when the surrounding code uses `?` correctly everywhere else.
