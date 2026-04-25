## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Temporary Dropped Mid-Match
// ------------------------------------------------------------------------

use std::env;

// CHANGE 1+2: Return String instead of &'static str so the Ok arm's owned String can be returned without dangling; callers borrow the returned String as &str at the call site.
pub fn get_base_url() -> String {
    match env::var("BASE_URL") {
        Ok(val) => val,
        // CHANGE 1: No longer take a reference to a temporary; return an owned String in both arms so lifetimes are consistent.
        Err(_) => "http://localhost:8080".to_string(),
    }
}

pub fn build_client_url(path: &str) -> String {
    // CHANGE 2: Bind the returned String to a local variable first, then borrow it as &str for format!, avoiding a temporary-borrow issue.
    let base = get_base_url();
    format!("{}/{}", base, path)
}
```

## Explanation

### Issue 1: Dangling Reference to Dropped Local

**Problem:** The compiler rejects the code with `error[E0716]: temporary value dropped while borrowed`. Inside the `Ok` arm, `val` is a `String` owned by the match arm. Taking `&val` produces a reference whose lifetime is tied to `val`, but `val` is dropped at the end of the arm. The variable `url: &str` then holds a dangling pointer, which Rust refuses to allow.

**Fix:** In `get_base_url`, change the return type from `&'static str` to `String`, return `val` directly in the `Ok` arm (no `&`), and return `"http://localhost:8080".to_string()` in the `Err` arm so both arms have the same owned type.

**Explanation:** Rust's borrow checker tracks lifetimes structurally. When you write `&val` inside the `Ok` arm, the reference's lifetime cannot outlive `val`. Because `val` is a local binding created by the `match` arm, it is dropped when the arm ends — certainly before `url` is used or returned. The `&'static str` return type annotation makes this worse: `'static` means the reference lives for the entire program, but a reference into a local `String` can never be `'static`. Returning an owned `String` transfers ownership out of the function cleanly; the caller holds the `String` and can borrow it as `&str` for as long as it lives. A related pitfall: if you tried to return `&str` by storing the `String` somewhere with a longer lifetime (e.g., a `static` `OnceLock`), that would work but is heavier machinery than just returning `String`.

---

### Issue 2: Wrong Return Type Hides the Real Contract

**Problem:** Declaring `-> &'static str` implies the returned slice is always pointing into static memory (a string literal baked into the binary). That is only true for the `Err` fallback arm. The `Ok` arm produces a heap-allocated `String` from the environment, which can never satisfy a `'static` lifetime. The mismatch between the declared contract and the actual data source is what forces the borrow-of-local error in the first place.

**Fix:** Replace `-> &'static str` with `-> String` and update `build_client_url` to bind `get_base_url()` into a local `let base` binding (already done in the original), so `format!` can borrow `&base` as a `&str` implicitly via `Deref`.

**Explanation:** `&'static str` is appropriate when you can guarantee the data lives for the entire program — string literals qualify because they are embedded in the binary's read-only segment. Data read from an environment variable lives on the heap and is allocated at runtime, so its lifetime is bounded by the `String` that holds it. Changing the return type to `String` accurately reflects that the caller receives ownership and is responsible for the memory. `String` implements `Deref<Target = str>`, so anywhere a `&str` is expected the compiler automatically coerces `&base` (a `&String`) into `&str` — no downstream API changes are needed.
