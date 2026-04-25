## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Move of Arc Before Clone
// ------------------------------------------------------------------------

use std::sync::Arc;
use std::thread;

pub struct Config {
    pub workers: usize,
    pub timeout_ms: u64,
}

pub fn spawn_workers(config: Arc<Config>, count: usize) {
    for i in 0..count {
        // CHANGE 1: Clone the Arc *before* the `move` closure so each thread gets its own handle and the original binding remains valid for the next iteration.
        let cfg = config.clone();
        // CHANGE 2: The closure now moves `cfg` (the per-iteration clone) rather than `config`, so `config` is never consumed by the closure.
        thread::spawn(move || {
            println!("worker {} timeout={}", i, cfg.timeout_ms);
        });
    }
}
```

## Explanation

### Issue 1: Arc moved into first closure iteration

**Problem:** The `move` keyword on the closure transfers ownership of every captured variable — including `config` — into the closure. After the first iteration, `config` is gone. The compiler rejects the second iteration with a "use of moved value" error.

**Fix:** Add `let cfg = config.clone();` immediately before the `thread::spawn` call (outside the closure). The closure then captures `cfg` instead of `config`, so `config` stays alive in the outer scope for every subsequent iteration.

**Explanation:** Rust's ownership model allows a value to be moved exactly once. A `move` closure takes ownership of the variables it references at the point the closure is created, not when it runs. Because `config` is referenced inside the closure body, Rust moves it on the first iteration. Cloning the `Arc` before constructing the closure produces a fresh owned handle (`cfg`) for each iteration, while the original `config` binding is only read (via `clone`) and never moved. `Arc::clone` is cheap — it increments an atomic reference count — so cloning once per iteration is the intended pattern for sharing state across threads.

---

### Issue 2: Clone placed inside closure, after the move has already occurred

**Problem:** The original code calls `config.clone()` inside the closure body. By the time that line would execute, the outer `config` binding has already been moved into the closure on the first call to `thread::spawn`. Even setting aside the compile error, calling `clone` inside the closure means the closure still needs to own `config` to call a method on it, so the move cannot be avoided.

**Fix:** Remove the `config.clone()` call from inside the closure entirely. The pre-cloned `cfg` variable is moved into the closure and used directly as `cfg.timeout_ms`, so no further clone is needed inside the thread.

**Explanation:** `Arc::clone` takes a reference to an `Arc<T>` and returns a new `Arc<T>`. Calling it inside a `move` closure still requires the closure to capture the original `Arc` by value, because `move` promotes all referenced variables to owned. Moving the clone to before the closure creation means the closure only captures the already-cloned `cfg`, which is a freshly owned `Arc` handle with no connection to the outer `config` binding. A common related pitfall is wrapping the loop body in a block hoping to limit lifetimes — that does not help here because the move still happens on the first iteration regardless of block scoping.
