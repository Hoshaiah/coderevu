## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Missing Lifetime Bound on Trait Object
// ------------------------------------------------------------------------

pub trait RequestFilter {
    fn filter(&self, path: &str) -> bool;
}

// CHANGE 1: Added lifetime parameter 'a to FilterChain and changed the trait object bound from the implicit 'static to the explicit '+ 'a, allowing filters that borrow data with lifetime 'a.
pub struct FilterChain<'a> {
    filters: Vec<Box<dyn RequestFilter + 'a>>,
}

// CHANGE 1: impl block also carries the lifetime parameter 'a to match the struct.
impl<'a> FilterChain<'a> {
    pub fn new() -> Self {
        FilterChain { filters: Vec::new() }
    }

    // CHANGE 2: Removed the 'static bound on F; now F only needs to live at least as long as 'a, which is the lifetime the chain itself is parameterized over.
    pub fn add<F: RequestFilter + 'a>(&mut self, f: F) {
        self.filters.push(Box::new(f));
    }

    pub fn run(&self, path: &str) -> bool {
        self.filters.iter().all(|f| f.filter(path))
    }
}

pub struct PrefixFilter<'a> {
    prefix: &'a str,
}

impl<'a> RequestFilter for PrefixFilter<'a> {
    fn filter(&self, path: &str) -> bool {
        path.starts_with(self.prefix)
    }
}

// CHANGE 3: Return type is now FilterChain<'a> instead of FilterChain, so the compiler knows the returned chain must not outlive the borrowed prefix string.
pub fn build_chain<'a>(prefix: &'a str) -> FilterChain<'a> {
    let mut chain = FilterChain::new();
    chain.add(PrefixFilter { prefix });
    chain
}
```

## Explanation

### Issue 1: Implicit 'static bound on trait object field

**Problem:** `Box<dyn RequestFilter>` without an explicit lifetime bound is sugar for `Box<dyn RequestFilter + 'static>`. Any filter type that borrows data (like `PrefixFilter<'a>`) cannot satisfy `'static`, so trying to store it in the `Vec` causes a compile error: "the parameter type `dyn RequestFilter` may not live long enough".

**Fix:** `FilterChain` gains a lifetime parameter `'a`, and the field type becomes `Vec<Box<dyn RequestFilter + 'a>>`. The `impl` block is updated to `impl<'a> FilterChain<'a>` to match.

**Explanation:** Rust requires that every reference inside a trait object lives at least as long as the trait object itself. When no lifetime is written, Rust defaults to `'static`, meaning "the data must live forever". Changing the bound to `'a` says "the data must live at least as long as the `FilterChain` instance", which is the relationship that actually needs to hold. If a caller tried to drop the borrowed config before dropping the chain, the borrow checker would catch it at the call site rather than silently allowing a dangling reference.

---

### Issue 2: 'static bound on FilterChain::add prevents non-'static filters

**Problem:** The `add` method requires `F: RequestFilter + 'static`. Even after fixing the struct's field type, this method-level bound still rejects `PrefixFilter<'a>` because `'a` is not `'static`. The compiler error appears on `chain.add(PrefixFilter { prefix })` in `build_chain`.

**Fix:** The bound on `add` changes from `F: RequestFilter + 'static` to `F: RequestFilter + 'a`, tying the filter's lifetime to the chain's own lifetime parameter rather than requiring it to be forever.

**Explanation:** The `'static` bound on `add` was the method-level mirror of the struct-level bug. Because `Box<dyn Trait>` used to require `'static` data, the method enforced `'static` on `F` to make the `Box::new(f)` assignment type-check. Once the struct's field accepts `'a`-bounded trait objects, `add` only needs `F: 'a` — the filter just has to outlive the chain. A related pitfall: if you keep `'static` on `add` even after fixing the struct, the method silently becomes more restrictive than the struct requires, and borrowed filters still cannot be added.

---

### Issue 3: build_chain return type erases the borrow lifetime

**Problem:** `build_chain` returns plain `FilterChain` (which, before the fix, means `FilterChain` with an implicit `'static` bound). The `PrefixFilter { prefix }` inside borrows `prefix: &'a str`, so the chain's contents can only be valid for `'a`. Without propagating `'a` to the return type, the compiler has no way to enforce that the caller keeps `prefix` alive as long as they hold the chain.

**Fix:** The return type of `build_chain` changes from `FilterChain` to `FilterChain<'a>`, so the lifetime relationship between the input borrow and the returned struct is explicit and enforced by the borrow checker.

**Explanation:** Rust lifetime elision does not infer that the output borrows from the input in this case, because `FilterChain` was not parameterized over a lifetime at all. Once `FilterChain<'a>` exists, writing `-> FilterChain<'a>` tells the compiler: "the chain I return is only valid while the data borrowed by its filters is alive". If the caller later tries to use the chain after `prefix` goes out of scope, they get a compile-time error rather than a use-after-free at runtime.
