## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Closure Captures Reference Past Its Owner
// ------------------------------------------------------------------------

use std::thread;

#[derive(Debug)]
pub struct Config {
    pub interval_secs: u64,
    pub endpoint: String,
}

pub struct Scheduler;

impl Scheduler {
    pub fn run(name: &'static str, config: Config) {
        // CHANGE 1: `config` is moved into the closure via `move`, and accessed directly (not via a re-borrow), so the closure owns the data and satisfies 'static.
        let handle = thread::spawn(move || {
            // CHANGE 2: Use `config` directly instead of reborrowing as `&config`; the value is already owned by the closure, no reference needed.
            loop {
                println!("[{}] polling {} every {}s", name, config.endpoint, config.interval_secs);
                thread::sleep(std::time::Duration::from_secs(config.interval_secs));
            }
        });
        handle.join().unwrap();
    }
}
```

## Explanation

### Issue 1: Closure captures local reference, not owned value

**Problem:** `thread::spawn` requires the closure to be `'static` — meaning it must not hold any references that could dangle after the calling frame returns. The original code captures `config` by reference (either explicitly or via the `let cfg = &config` reborrow pattern), and that reference points into `run`'s stack frame. The compiler rejects this because the spawned thread can outlive `run`.

**Fix:** Add the `move` keyword to the closure (it is already present in the buggy version, which is good) and remove the `let cfg = &config` reborrow. Access `config.endpoint` and `config.interval_secs` directly inside the loop. The `move` closure takes ownership of `config`, so no reference to the outer frame exists.

**Explanation:** When you write `move || { let cfg = &config; ... }`, the `move` causes `config` to be moved into the closure — that part is fine. But then `let cfg = &config` immediately creates a new borrow of the now-closure-owned value, which is also fine at runtime. The real problem described in the context is the pre-`move` version where `config` was captured by reference from the enclosing scope. Because `config` lives on `run`'s stack, a reference to it cannot satisfy `'static`. Moving ownership into the closure (via `move`) and using the value directly is the correct fix: the closure now owns the data and its lifetime is not tied to `run`'s frame. A related pitfall: if `Config` contained non-`Send` fields (like `Rc`), the closure still would not compile even with `move`, because `thread::spawn` also requires `Send`.

---

### Issue 2: `&'static Config` annotation is the wrong approach

**Problem:** The developer attempted to resolve the `'static` requirement by annotating the parameter as `&'static Config`. This does not compile in practice unless the caller provides a reference to a value with a truly static lifetime (e.g., a `static` variable or a `Box::leak`). For a locally constructed `Config`, no such guarantee exists, so callers cannot satisfy the constraint.

**Fix:** Remove any `&'static Config` annotation from the function signature and keep the parameter as the owned type `Config`. This lets the caller pass a normally constructed value, and the `move` closure then takes ownership of it cleanly.

**Explanation:** `'static` as a lifetime bound on a reference means the referent must live for the entire program. Slapping `&'static` on a parameter just pushes the problem to the caller — they now have to produce a reference that lives forever, which is almost never what you want for configuration data. The correct mental model is: if a thread needs data, give it ownership via `move`, not a promise that the data lives forever. `Box::leak` can convert owned data to a `&'static` reference, but it intentionally leaks memory and is a last resort, not a routine fix.
