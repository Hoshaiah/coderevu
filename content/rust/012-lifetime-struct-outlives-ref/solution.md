## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Struct Lifetime Shorter Than Borrow
// ------------------------------------------------------------------------

pub struct ColumnFilter<'a> {
    pub column: &'a str,
    pub predicate: &'a str,
}

impl<'a> ColumnFilter<'a> {
    pub fn new(column: &'a str, predicate: &'a str) -> Self {
        ColumnFilter { column, predicate }
    }

    pub fn matches(&self, value: &str) -> bool {
        value.contains(self.predicate)
    }
}

// CHANGE 1: Add explicit lifetime `'a` binding `config` reference to the returned `ColumnFilter<'a>`, so the borrow checker knows the returned references live as long as `config` does.
pub fn build_filter<'a>(config: &'a std::collections::HashMap<String, String>) -> ColumnFilter<'a> {
    // CHANGE 2: The `.as_str()` calls borrow from `config` which is now `'a`, so `col` and `pred` are `&'a str` and satisfy `ColumnFilter::new`'s bounds.
    let col = config.get("column").map(|s| s.as_str()).unwrap_or("id");
    let pred = config.get("predicate").map(|s| s.as_str()).unwrap_or("");
    ColumnFilter::new(col, pred)
}
```

## Explanation

### Issue 1: Missing lifetime on `build_filter` return type

**Problem:** `build_filter` returns `ColumnFilter` with no lifetime annotation, so the compiler applies lifetime elision rules. Because there is only one reference input (`config`) the elided lifetime on the return type should in theory be tied to `config`, but because `ColumnFilter<'a>` itself requires an explicit lifetime argument and none is supplied, the compiler cannot connect the dots and rejects the code with `config does not live long enough`.

**Fix:** Introduce an explicit lifetime parameter `'a` on the function signature — `pub fn build_filter<'a>(config: &'a HashMap<String, String>) -> ColumnFilter<'a>` — so the return type's lifetime is explicitly the same as the borrow of `config`.

**Explanation:** Rust's lifetime elision rules fill in omitted lifetimes mechanically. When you write `-> ColumnFilter` without a lifetime argument, the compiler needs to decide what `'a` in `ColumnFilter<'a>` is. Because no explicit `'a` is stated on either the parameter or the return position, elision cannot resolve the struct's internal lifetime to the `config` reference. Introducing `'a` on both the parameter and the return type tells the borrow checker: "the strings inside the returned struct borrow from the same allocation that `config` points at, and must not outlive it." The caller then holds a `ColumnFilter` that is provably valid for exactly as long as the `config` map stays in scope, enabling the zero-copy design without `String` allocations.

---

### Issue 2: Lifetime of `.as_str()` results not connected to function output

**Problem:** `config.get("column").map(|s| s.as_str())` produces a `&str` that borrows from the `String` stored inside `config`. Without the lifetime `'a` threading through, the compiler treats the type of this `&str` as some anonymous, short lifetime that does not match what `ColumnFilter::new` expects when the return type is unconstrained.

**Fix:** Once `config` is typed as `&'a HashMap<String, String>` (CHANGE 1), the `String` values inside it are also reachable for `'a`, so `.as_str()` yields `&'a str`. No other change to the body is needed — the types unify automatically.

**Explanation:** A `HashMap<String, String>` owns its values. When you borrow the map for lifetime `'a`, every `&String` you get back from `.get()` is also valid for `'a`, and `.as_str()` on a `&'a String` gives `&'a str`. The `unwrap_or("id")` and `unwrap_or("")` fallbacks are `&'static str` literals, which coerce to `&'a str` for any `'a`, so they are compatible. The root cause was not the body logic but the missing lifetime bridge on the function signature that prevented the compiler from seeing the chain: map borrow → value reference → str slice → struct field → return value all sharing the same lifetime.
