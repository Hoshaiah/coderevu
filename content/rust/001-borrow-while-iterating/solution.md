## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Cannot mutate a Vec while holding a reference into it
// ------------------------------------------------------------------------
pub struct Entry {
    pub key: String,
    pub value: i32,
}

pub fn normalize_and_fan_out(entries: &mut Vec<Entry>) {
    // CHANGE 1: Collect derived entries into a separate Vec instead of pushing directly into `entries` while it is being iterated. This breaks the simultaneous mutable-borrow conflict: the loop holds an exclusive borrow on `entries`, so calling `entries.push()` inside it is illegal.
    let mut derived: Vec<Entry> = Vec::new();

    for entry in entries.iter_mut() {
        entry.key = entry.key.to_lowercase();
        if entry.value > 1000 {
            // CHANGE 1: Push to `derived` instead of `entries`.
            derived.push(Entry {
                key: format!("{}__overflow", entry.key),
                value: entry.value - 1000,
            });
        }
    }

    // CHANGE 2: After the loop the borrow from `iter_mut()` has ended, so `entries` can be mutated again. Extend it with all derived entries.
    entries.extend(derived);
}
```

## Explanation

### Issue 1: Borrow conflict between iterator and push

**Problem:** The compiler rejects the function with a borrow-checker error. `iter_mut()` takes an exclusive (`&mut`) borrow over the entire `Vec` for the lifetime of the loop. Calling `entries.push(...)` inside the same loop tries to take a second exclusive borrow of `entries`, which is forbidden. The code never compiles.

**Fix:** Replace the in-loop `entries.push(...)` call with `derived.push(...)`, where `derived` is a fresh `Vec<Entry>` declared before the loop (see `// CHANGE 1` sites). This removes all access to `entries` inside the loop body except through the iterator itself.

**Explanation:** Rust's ownership rules allow at most one live `&mut T` to a value at a time. `iter_mut()` returns an iterator that stores a `&mut Vec<Entry>` internally; that reference lives until the loop ends. A second `&mut` to push onto the same Vec would alias the first one, which the borrow checker forbids regardless of whether it would actually be safe at runtime. Moving the push target to a separate `Vec` means only one mutable reference to `entries` exists at a time. A related pitfall: wrapping the Vec in `Rc<RefCell<...>>` compiles but moves the borrow check to runtime, turning a compile-time error into a `BorrowMutError` panic whenever two live borrows overlap — as the coworker discovered.

---

### Issue 2: Derived entries must be appended after the loop

**Problem:** Once the loop and its borrow are separated from the push logic, the derived entries sit in a local `Vec` and are never added back to `entries` unless the code does so explicitly. Without the `extend` call the function silently discards every overflow entry.

**Fix:** Add `entries.extend(derived);` after the loop (see `// CHANGE 2`). At that point the `iter_mut()` borrow has ended, so `entries` is free to be mutated again.

**Explanation:** Rust drops borrow lifetimes at the end of the block or statement that created them. Once the `for` loop completes, the exclusive borrow held by `iter_mut()` is released, and `entries` can be borrowed mutably again. `Vec::extend` moves every element out of `derived` and appends them to `entries` in one call, preserving the original intent: every entry whose `value > 1000` produces an extra overflow entry at the end of the Vec. If the extend call is omitted, the function compiles and runs without error but silently drops all derived entries — a logic bug with no visible diagnostic.
