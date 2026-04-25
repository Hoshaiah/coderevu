## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Reference Outlives Local String
// ------------------------------------------------------------------------

use std::collections::HashMap;

// CHANGE 2: Return owned `String` instead of `&'a str` so both branches can return a value with no dangling-reference issue.
pub fn get_default_user(config: &HashMap<String, String>) -> String {
    if let Some(user) = config.get("default_user") {
        // CHANGE 1: Clone the borrowed `&str` into an owned `String` so the return value does not borrow from `config` and lives past this call.
        user.clone()
    } else {
        String::from("anonymous")
    }
}
```

## Explanation

### Issue 1: Dangling reference to dropped local `String`

**Problem:** In the `else` branch, `fallback` is a `String` created inside the function body. Calling `.as_str()` on it produces a `&str` that borrows from `fallback`. When the function returns, `fallback` is dropped, so the reference would point to freed memory. The compiler rejects this at compile time with a lifetime error.

**Fix:** Replace the `.as_str()` call (and the whole fallback path) with a directly returned `String::from("anonymous")`. The `if let` branch uses `user.clone()` to return an owned `String` instead of borrowing from the map.

**Explanation:** Rust's borrow checker tracks the lifetime of every reference. The signature `-> &'a str` tells the compiler the returned reference lives at least as long as `'a`, which is tied to the `config` parameter. The local `fallback` string has a much shorter lifetime — it ends at the closing brace of the function — so it can never satisfy `'a`. There is no escape hatch short of leaking memory (`Box::leak`) or using `'static` string literals. The clean solution is to return an owned `String` so neither branch needs to hold a borrow into a temporary or into `config`.

---

### Issue 2: Return type forces impossible lifetime on fallback path

**Problem:** The declared return type `-> &'a str` requires every code path to return a reference that borrows from `config` (lifetime `'a`). The fallback path creates new data that has no connection to `config`, so it is structurally impossible to satisfy that lifetime constraint, and the function cannot compile.

**Fix:** Remove the lifetime parameter from the signature entirely and change the return type to `String`. This is shown at the `CHANGE 2` site: `pub fn get_default_user(config: &HashMap<String, String>) -> String`.

**Explanation:** When a function returns a reference, Rust must trace where that reference came from — it must be borrowed from one of the inputs or be `'static`. Because the fallback value is freshly constructed, it does not come from any input, so no lifetime annotation can make it valid as a returned reference. Switching the return type to `String` moves ownership out of the function instead of handing out a borrow, which sidesteps the lifetime problem entirely. The cost is one heap allocation for the `clone()` call on the happy path, but correctness requires it. A caller that truly needs a `&str` can call `.as_str()` on the returned `String` in its own scope, where the `String` will still be alive.
