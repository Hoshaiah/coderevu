## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Elided Lifetime Ties Ref to Wrong Scope
// ------------------------------------------------------------------------

use std::collections::HashMap;

pub struct Cache {
    store: HashMap<String, String>,
}

impl Cache {
    pub fn new() -> Self {
        Cache { store: HashMap::new() }
    }

    // Inserts `value` if `key` is absent; returns a ref to the stored value.
    pub fn get_or_insert(&mut self, key: String, value: String) -> &String {
        self.store.entry(key).or_insert(value)
    }

    // CHANGE 1: Add explicit lifetime `'a` bound to `self` and the return type so the compiler knows the returned `&str` lives as long as the cache, not as long as `default`.
    pub fn resolve<'a>(&'a mut self, key: &str, default: &str) -> &'a str {
        self.get_or_insert(key.to_owned(), default.to_owned())
    }
}
```

## Explanation

### Issue 1: Elision Ties Return Lifetime to Wrong Parameter

**Problem:** Without explicit lifetime annotations, Rust's elision rules for a method with two reference inputs (`&mut self` and `default: &str`) cannot uniquely determine which input the output borrows from. The compiler picks a conservative lifetime — in this case it ties the returned `&str` to `default`. This means the returned reference cannot outlive the `default` argument, which is typically a short-lived local or literal. The code fails to compile with an error on the `return` site of `resolve`.

**Fix:** Add a named lifetime `'a` to `resolve`: `pub fn resolve<'a>(&'a mut self, key: &str, default: &str) -> &'a str`. This explicitly tells the compiler the output borrows from `self`, not from `default`.

**Explanation:** Rust's lifetime elision rules for methods say: if there is exactly one reference in the inputs, that lifetime is assigned to all outputs. When there are multiple input lifetimes, elision cannot decide automatically and falls back to requiring the programmer to be explicit. Here, `&mut self` and `default: &str` are two distinct input lifetimes. The compiler cannot guess that the returned string slice comes from data inside `self` (stored in `HashMap`), not from `default`. By naming `'a` and attaching it to both `&'a mut self` and the return type `-> &'a str`, you tell the compiler the exact relationship. The `default` parameter is consumed immediately via `default.to_owned()`, so no borrow of it escapes — the returned reference truly lives as long as `self.store`.

---

### Issue 2: `get_or_insert` Elision Works but Cannot Propagate Through `resolve` Without Explicit Lifetimes

**Problem:** `get_or_insert` has only `&mut self` as its reference input, so elision correctly infers the returned `&String` borrows from `self`. However, when `resolve` calls `get_or_insert` and tries to return that value, the compiler checks whether the return type of `resolve` is compatible. Without an explicit `'a` on `resolve`, there is no way for the compiler to confirm the chain from `self` through `get_or_insert` back out through `resolve`, causing a compilation error.

**Fix:** The same `// CHANGE 1` annotation — adding `<'a>` to `resolve` and annotating `&'a mut self` and `-> &'a str` — resolves this too, because it gives the compiler a named lifetime to follow through the call chain.

**Explanation:** Even though `get_or_insert` is correctly annotated via elision, each function's signature is checked independently. When `resolve` calls `get_or_insert`, the compiler sees `get_or_insert` returns a reference with the lifetime of `self` inside that call, but `resolve` must then re-express that lifetime in its own signature. Without `'a` on `resolve`, the compiler has no named lifetime to attach the return to from `self`, so it infers one tied to `default` instead. Adding `'a` to `resolve` creates the explicit bridge. A related pitfall: if you tried returning a reference to `default` itself this would be a genuine dangling-reference bug at runtime in languages without borrow checking — Rust catches it at compile time precisely because of this lifetime machinery.
