## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Closure Captures Loop Index Late
// ------------------------------------------------------------------------

pub fn build_retry_closures(task_count: usize) -> Vec<Box<dyn Fn()>> {
    let mut closures: Vec<Box<dyn Fn()>> = Vec::new();

    // CHANGE 2: replaced while+mutable-index with for loop over a range; each iteration binds a fresh immutable `index` variable, making the move capture in CHANGE 1 straightforward and correct.
    for index in 0..task_count {
        // CHANGE 1: added `move` so the closure captures its own copy of `index` at the time of creation, not a shared reference to the loop variable that will keep changing.
        closures.push(Box::new(move || {
            println!("Retrying task {}", index);
        }));
    }

    closures
}
```

## Explanation

### Issue 1: Closure Captures Variable by Reference, Not by Value

**Problem:** Every closure in the returned `Vec` logs the same task index — whichever value `index` holds after the loop finishes (equal to `task_count`). No matter which closure you call, the output always says "Retrying task N" where N is the final value.

**Fix:** Add the `move` keyword before the closure's `||` parameter list (`move ||`). This forces the closure to take ownership of `index` at construction time instead of borrowing the single mutable variable that lives in the enclosing scope.

**Explanation:** In Rust, closures capture variables from the enclosing scope by the least-restrictive method that compiles — typically a shared or mutable reference. Without `move`, every closure holds a reference to the same `index` variable. By the time any closure is called, the `while` loop has already incremented `index` to `task_count`. With `move`, Rust copies the current value of `index` (a `usize`, which is `Copy`) into each closure's own storage at the moment `Box::new(move || …)` is evaluated. Closure 0 owns the value `0`, closure 1 owns `1`, and so on. A related pitfall: if `index` were a non-`Copy` type, `move` would move it, and you'd need to clone before the loop body to keep a separate owned value per closure.

---

### Issue 2: Mutable Loop Variable Makes Late-Capture Easy to Miss

**Problem:** The `while` loop with `let mut index = 0` and `index += 1` keeps a single mutable binding alive for the entire function scope. This is exactly the kind of long-lived mutable variable that gets accidentally shared across closures, and the code gives no visual hint that each iteration should produce an independent value.

**Fix:** Replace the `while` loop and the `let mut index` declaration with `for index in 0..task_count`. The `index` binding in a `for` loop is re-introduced fresh on each iteration with its own identity, making the intent — one value per closure — explicit.

**Explanation:** A `for index in 0..task_count` loop creates a new binding named `index` at the start of each iteration. When paired with `move`, each closure captures a distinct binding rather than competing over one shared variable. The `while` version technically works once `move` is added (because `move` copies the current integer value), but the `for` version makes the ownership model clearer and eliminates the mutable accumulator that caused the original confusion. Keeping mutable state minimal reduces the surface area for this class of capture bugs in future refactors.
