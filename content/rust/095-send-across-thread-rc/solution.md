## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Replacing `Arc` with `Rc` to avoid atomic overhead causes a compile error in disguise
// ------------------------------------------------------------------------
use std::sync::Arc; // CHANGE 1: replace `std::rc::Rc` with `std::sync::Arc` so ConfigCache is Send + Sync
use std::collections::HashMap;

#[derive(Debug)]
pub struct Config {
    pub values: HashMap<String, String>,
}

#[derive(Clone)]
pub struct ConfigCache {
    // CHANGE 1: Rc -> Arc here so the field (and therefore ConfigCache) implements Send
    inner: Arc<Config>,
}

impl ConfigCache {
    pub fn new(values: HashMap<String, String>) -> Self {
        ConfigCache {
            // CHANGE 1: Rc::new -> Arc::new
            inner: Arc::new(Config { values }),
        }
    }

    // CHANGE 2: removed the #[allow(dead_code)] that was hiding the real design issue; the method is genuinely used in reload_worker so no suppression is needed
    pub fn get(&self, key: &str) -> Option<&str> {
        self.inner.values.get(key).map(|s| s.as_str())
    }
}

pub async fn reload_worker(cache: ConfigCache) {
    tokio::spawn(async move {
        let _ = cache.get("version");
    }).await.unwrap();
}
```

## Explanation

### Issue 1: `Rc` is not `Send`, breaking `tokio::spawn`

**Problem:** When a colleague tries to call `reload_worker`, the compiler rejects the code with an error like `ConfigCache cannot be sent between threads safely` because `tokio::spawn` requires its future to be `Send + 'static`. `Rc<T>` deliberately does not implement `Send` because its reference count is a plain integer with no atomic guarantees.

**Fix:** Replace `use std::rc::Rc` with `use std::sync::Arc`, and change every `Rc::new(...)` call to `Arc::new(...)`. `Arc<Config>` uses atomic operations for the reference count, which makes it safe to share across thread boundaries, so `ConfigCache` then satisfies the `Send` bound that `tokio::spawn` requires.

**Explanation:** Rust's type system tracks thread-safety through the `Send` and `Sync` marker traits. `Rc<T>` opts out of `Send` because if two threads cloned the same `Rc` and decremented the count concurrently, the count could corrupt silently. `Arc<T>` uses `std::sync::atomic` operations instead, making cross-thread cloning safe. `tokio::spawn` moves the async block onto the executor's thread pool, so every captured value must be `Send`. Because `ConfigCache` contains an `Rc`, it is not `Send`, and the compiler blocks the call at the `tokio::spawn` site. Switching to `Arc` adds a small atomic increment/decrement cost on clone and drop, but that is the correct trade-off when the value crosses thread boundaries. A related pitfall: wrapping a non-`Send` type (like `Rc`, `Cell`, or `RefCell`) inside a struct does not make it `Send`; the outer struct automatically inherits the same restriction.

---

### Issue 2: `#[allow(dead_code)]` suppressed a warning that pointed at the real problem

**Problem:** The developer added `#[allow(dead_code)]` to silence a compiler warning, but the warning existed because the method was only reachable through code that the compiler could not see was `Send`-safe. Suppressing the warning hid a signal that something was structurally wrong with the design, letting the broken code ship unnoticed.

**Fix:** Remove the `#[allow(dead_code)]` attribute entirely. In the reference solution, `get` is called inside `reload_worker`, so the compiler sees it is used and emits no warning without any suppression attribute needed.

**Explanation:** `dead_code` warnings exist to flag methods or types that are never reachable in the compiled output. When a method is hidden behind a `#[allow(dead_code)]`, engineers stop asking why the warning appeared in the first place. In this case the real answer was that the method's owning type was not usable in the async context where it was intended to be called, so the usage site was effectively unreachable from the compiler's perspective. Removing the suppressor forces the team to address the root cause. A good rule of thumb: `#[allow(dead_code)]` is acceptable in library crates where items are part of the public API but not used internally; it is a red flag when applied to items that are supposed to be called from within the same crate.
