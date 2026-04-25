## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Closure Captures Reference to Dropped Local
// ------------------------------------------------------------------------

pub type Stage = Box<dyn Fn(i64) -> i64 + Send + 'static>;

fn load_factor(config_key: &str) -> i64 {
    // Simulated config lookup.
    match config_key {
        "double" => 2,
        "triple" => 3,
        _        => 1,
    }
}

pub fn make_multiplier_stage(config_key: &str) -> Stage {
    let factor = load_factor(config_key);
    // CHANGE 1: Remove the erroneous capture of `config_key` — `factor` is an owned i64 so the closure is 'static.
    // CHANGE 2: Drop the `let _ = config_key;` line that was accidentally capturing the non-'static reference.
    Box::new(move |input: i64| -> i64 {
        input * factor
    })
}
```

## Explanation

### Issue 1: Closure captures non-`'static` reference

**Problem:** `config_key` is a `&str` whose lifetime is tied to the caller's stack frame. The return type `Stage` requires the closure to be `'static`, meaning it must not hold any references shorter than `'static`. The compiler rejects the code with a lifetime error because `config_key` cannot outlive the function call.

**Fix:** Remove the `let _ = config_key;` line inside the closure so `config_key` is no longer captured. The closure then only captures `factor`, which is an owned `i64` and satisfies `'static` with no issues.

**Explanation:** Rust's borrow checker tracks every value a `move` closure references. Even a `let _ = config_key;` statement that appears to discard the value still causes the closure to capture `config_key` by value — but because `&str` is a reference, "by value" still means copying the reference itself, which carries the original lifetime. That lifetime is shorter than `'static`, so the bound `Box<dyn Fn(i64) -> i64 + Send + 'static>` cannot be satisfied. The correct approach is to resolve everything you need from `config_key` before the closure is built (here, `load_factor` does exactly that), then let the closure capture only the resulting owned value.

---

### Issue 2: Dead capture of `config_key` inside the closure body

**Problem:** The line `let _ = config_key;` inside the closure does nothing useful — the result of the expression is immediately discarded. It is dead code that exists only because someone intended to use `config_key` inside the closure but never finished, or forgot to remove it after refactoring.

**Fix:** Delete `let _ = config_key;` entirely. After this removal the closure body is just `input * factor`, which is the correct and intended computation.

**Explanation:** In Rust, `let _ = expr;` evaluates `expr` for side effects but drops the result immediately. For a `&str`, there are no side effects, so the line truly does nothing. However, the compiler still considers `config_key` to be captured by the closure because the expression references it. Removing the line eliminates the capture, resolves the `'static` lifetime conflict, and leaves the closure semantically equivalent to what was intended. A related pitfall: if someone "fixes" this by cloning `config_key` into a `String` and capturing that, the closure compiles but the behaviour depends on when the clone is taken and which copy of the value is used — that is the wrong patch the problem statement warns about.
