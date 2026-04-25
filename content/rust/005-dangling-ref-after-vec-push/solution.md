## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Reference Invalidated by Vec Reallocation
// ------------------------------------------------------------------------

pub struct Interner {
    storage: Vec<String>,
}

impl Interner {
    pub fn new() -> Self {
        Interner { storage: Vec::new() }
    }

    /// Returns a reference that lives as long as the Interner.
    pub fn intern(&mut self, s: &str) -> &str {
        // CHANGE 1: Check for existing entry first, recording its index rather than holding a reference across the push that may reallocate the Vec.
        for i in 0..self.storage.len() {
            if self.storage[i] == s {
                // CHANGE 2: Re-borrow through the index AFTER all mutations are done so no raw pointer is taken before a potential reallocation.
                return unsafe { &*(self.storage[i].as_str() as *const str) };
            }
        }
        // CHANGE 1 (continued): push first, THEN take a raw pointer so the pointer
        // is captured after the reallocation that push may cause, not before it.
        self.storage.push(s.to_owned());
        let last_idx = self.storage.len() - 1;
        // CHANGE 1 (continued): derive the pointer from the element at its final
        // address, guaranteeing the Vec will not move it again before we read it.
        unsafe { &*(self.storage[last_idx].as_str() as *const str) }
    }
}
```

## Explanation

### Issue 1: Raw Pointer Captured Before `push` Reallocation

**Problem:** After calling `self.storage.push(s.to_owned())`, the `Vec` may reallocate its internal buffer, moving all existing `String` objects to a new heap address. The code then calls `self.storage.last().unwrap()` to get a reference to the newly pushed element, but by this point the pointer derived from the pre-push `last()` call would already be dangling. Even more concretely, any `&str` raw-pointer cast taken from an *existing* entry before the `push` is equally invalidated if reallocation occurs, because the whole backing array moves. Miri flags this as undefined behaviour on the first reallocation.

**Fix:** The fix restructures the function so no raw pointer is taken until after `push` completes. Existing entries are matched by index (`for i in 0..self.storage.len()`), storing only the index. The raw pointer for the returned `&str` is always derived after `push` finishes, at `CHANGE 1`, so the address is stable at the moment of capture.

**Explanation:** A `Vec<T>` stores its elements in a contiguous heap allocation. When you call `push` and the current capacity is exhausted, the `Vec` allocates a larger buffer, copies all elements there, and frees the old buffer. Any raw pointer or reference derived from an element in the old buffer is now a dangling pointer. In the buggy code, `inserted` is obtained via `self.storage.last().unwrap()` which internally uses the element's current address — but `push` just moved that element, so the address `inserted` holds is the pre-move address and reading through it is use-after-free. The fix captures the index before `push`, then re-derives the pointer from `self.storage[last_idx]` after `push` has finished and the Vec is in its final, possibly reallocated, state.

---

### Issue 2: Pre-Push Raw-Pointer Cast of Existing Entries

**Problem:** The original loop iterates `for existing in &self.storage` and, on a match, casts `existing.as_str()` to a raw pointer before returning it. If no match is found the loop body is skipped, but the iterator holds shared references into `storage`. While the cast itself is not the immediate crash site, taking a raw pointer to a `String`'s internal data before a subsequent `push` can reallocate `storage` means a caller who stores that pointer and then interns another string may see garbage — the `String` heap data itself is owned by the `String` object, so it survives the `Vec` reallocation, but the code pattern trains reviewers to believe raw-pointer casts here are safe, obscuring the real hazard.

**Fix:** At `CHANGE 2`, the existing-entry path is rewritten to loop by index and re-derive the `&str` pointer from `self.storage[i]` inside the same expression that returns it, making the relationship between pointer lifetime and `Vec` state explicit and auditable.

**Explanation:** `String` owns its character data on the heap separately from the `Vec`'s buffer, so a `String`'s `as_str()` pointer does survive a `Vec` reallocation — meaning the existing-entry path does not itself cause undefined behaviour in the current code. However, mixing safe iteration with raw-pointer casts masks the fact that the unsafe block's safety invariant ("storage is never mutated after insertion") is false: every new `intern` call may push. Rewriting to index-based access makes the borrow structure explicit: no reference into `storage` is alive across the `push`, and the raw-pointer cast appears only at the point of return when no further mutation follows.
