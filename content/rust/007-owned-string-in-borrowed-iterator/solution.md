## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Temporary String Dropped Too Early
// ------------------------------------------------------------------------

use std::collections::HashMap;

pub fn active_prefixes<'a>(
    config: &'a HashMap<String, bool>,
// CHANGE 2: Return owned `String` instead of `&'a str` so the iterator carries the data rather than a dangling borrow.
) -> impl Iterator<Item = String> + 'a {
    config
        .iter()
        .filter(|(_, &active)| active)
        .map(|(key, _)| {
            // CHANGE 1: Return the owned `String` directly instead of calling `.as_str()`, which would borrow a local that is immediately dropped.
            format!("prefix::{}", key)
        })
}
```

## Explanation

### Issue 1: Local `String` Dropped Before Borrow Escapes

**Problem:** The closure calls `format!("prefix::{}", key)` and stores the result in a local `String` named `prefixed`. It then returns `prefixed.as_str()`, a `&str` that borrows from `prefixed`. But `prefixed` is a local variable owned by the closure body — it is dropped at the end of every `.map()` invocation, before the caller ever gets the `&str`. The compiler catches this and refuses to compile with "temporary value dropped while borrowed".

**Fix:** Remove the `let prefixed` binding and the `.as_str()` call. Instead, return the `String` produced by `format!("prefix::{}", key)` directly from the closure. The owned value is now moved out of the closure rather than dropped inside it.

**Explanation:** In Rust, a `&str` is just a pointer and a length into memory owned by something else. When `prefixed` goes out of scope at the closing `}` of the closure, the heap allocation backing it is freed. Any `&str` that pointed into it would then point at freed memory — a dangling reference. Rust's borrow checker detects that the lifetime of `prefixed` does not outlive the closure invocation and refuses to compile. Returning the `String` itself transfers ownership to the iterator's consumer, so no borrowing across a drop boundary occurs. A related pitfall: even storing the `&str` in a `Vec` inside the same function would have the same problem if the owning `String`s are dropped before the `Vec` is used.

---

### Issue 2: Return Type Claims a Lifetime the Data Cannot Satisfy

**Problem:** The function signature declares `impl Iterator<Item = &'a str>`, promising that each yielded string slice lives as long as `'a` — the lifetime of the `config` map. But the actual string data is freshly allocated inside the closure and has no connection to `config`'s lifetime. Even if the borrow checker somehow allowed it, the lifetime annotation would be a lie.

**Fix:** Change the return type to `impl Iterator<Item = String> + 'a`. This says the iterator yields owned `String` values (no lifetime constraint on the items) and that the iterator itself may hold a reference into `config` for `'a` (because the closure captures `key` which borrows from `config`).

**Explanation:** Rust's `impl Trait` return type must accurately describe what the concrete type can guarantee. Annotating `Item = &'a str` tells the compiler "each slice lives for the config's lifetime", which requires the backing storage to also live that long. Since `format!` allocates a brand-new `String` each time, its storage cannot be tied to `'a`. Switching `Item` to `String` removes the false lifetime claim: each caller gets an owned allocation it is responsible for. The `+ 'a` bound on the iterator itself is still needed because the iterator captures a reference into `config` (via `key`), so the iterator cannot outlive `'a`. Without `+ 'a`, the compiler would reject the return type because the closure's captured data has a lifetime that must be expressed somewhere.
