## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Closure Moves String Every Iteration
// ------------------------------------------------------------------------

fn send_to(recipient: &str, message: String) {
    println!("Sending to {}: {}", recipient, message);
}

pub fn dispatch(recipients: &[&str], prefix: String, body: &str) {
    // CHANGE 1: Borrow `prefix` as `&str` before the closure so the closure captures a reference instead of taking ownership of the `String`.
    let prefix_ref: &str = &prefix;
    let make_message = |r: &&str| {
        // CHANGE 2: Use `prefix_ref` (a shared borrow) so the closure borrows `prefix` rather than moving it, avoiding both the compile error and any cloning.
        let full = format!("{}: {}", prefix_ref, body);
        send_to(r, full);
    };
    recipients.iter().for_each(make_message);
}
```

## Explanation

### Issue 1: Closure moves `prefix`, exhausting it after first use

**Problem:** The closure `make_message` references `prefix` directly. Rust infers that it must capture `prefix` by move because `String` is not `Copy`. After the first call to `make_message`, ownership of `prefix` has been transferred into the closure's environment and the value is gone. Every subsequent iteration fails to compile with `use of moved value: prefix`.

**Fix:** Before constructing the closure, take a `&str` borrow of `prefix` via `let prefix_ref: &str = &prefix;`. The closure then captures `prefix_ref`, which is a plain reference. References are `Copy`, so the closure can be called any number of times without consuming anything.

**Explanation:** Rust closures capture the minimal set of variables they mention, but the capture mode (move vs. borrow) is decided per-variable based on how the variable is used. Because `prefix` is a `String` (not `Copy`) and the closure refers to it, Rust moves it into the closure on construction. That move happens once — not per iteration — but since the closure now owns the value and `FnMut`/`Fn` closures don't re-receive owned values on each call, the real damage is that the outer scope loses `prefix` after the closure is built. Creating a `&str` beforehand means the closure captures a reference, which is `Copy` and can be used arbitrarily many times. A related pitfall: adding `move` to the closure keyword would also move the reference into the closure, but since the reference is `Copy` that is harmless — whereas adding `move` before the original code just forces the whole `String` in, which doesn't help.

---

### Issue 2: Cloning `prefix` per iteration is unnecessary allocation

**Problem:** The junior engineer's attempted fix calls `prefix.clone()` inside the closure body on every iteration. Each clone allocates a new heap buffer and copies all the bytes of `prefix` into it, even though the closure never needs to own those bytes — it passes them straight into `format!` which reads them.

**Fix:** Replace the per-iteration `clone()` with a single `&str` borrow captured by the closure (`prefix_ref` introduced at CHANGE 1 and used at CHANGE 2). `format!` accepts `&str` via the `Display` trait, so no owned `String` is needed at all.

**Explanation:** `format!` calls `Display::fmt` on each argument, which only requires a shared reference. Giving `format!` a `&str` and giving it a `String` produce identical output, but passing a `&str` skips the heap allocation entirely. The clone was the minimal fix a junior engineer reaches for because it restores compilability, but it pays an allocation cost on every recipient in the list. For a small prefix this is cheap, but it is still wrong in principle — the data is read-only, so the right tool is a shared reference. Capturing `prefix_ref: &str` before the closure lets the borrow checker confirm that `prefix` lives at least as long as the closure, which it does because both are in the same function scope.
