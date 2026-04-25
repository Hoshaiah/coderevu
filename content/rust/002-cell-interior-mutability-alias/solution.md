## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Shared Reference Hides Mutation
// ------------------------------------------------------------------------

use std::cell::Cell;

pub struct ScoredCache {
    scores: Vec<f64>,
    // CHANGE 2: hits is now Cell<usize> so it can be mutated through a shared &self reference.
    hits: Cell<usize>,
}

impl ScoredCache {
    pub fn new(scores: Vec<f64>) -> Self {
        // CHANGE 2: initialise hits as Cell<usize> wrapping 0.
        ScoredCache { scores, hits: Cell::new(0) }
    }

    pub fn get(&self, idx: usize) -> Option<&f64> {
        self.record_hit();
        self.scores.get(idx)
    }

    fn record_hit(&self) {
        // CHANGE 1: use Cell::set to write the incremented value back through &self instead of mutating a local copy that is then discarded.
        self.hits.set(self.hits.get() + 1);
    }

    pub fn hit_count(&self) -> usize {
        // CHANGE 2: unwrap the Cell value with get() so the return type stays usize.
        self.hits.get()
    }
}
```

## Explanation

### Issue 1: Local copy discarded, field never updated

**Problem:** `record_hit` copies `self.hits` into a local variable `copy`, increments `copy`, and then returns — the original field is never touched. Every call to `hit_count` reads the original field, which stays `0` forever, matching what operators see in the dashboard.

**Fix:** Replace the copy-and-discard pattern with `self.hits.set(self.hits.get() + 1)` at the `CHANGE 1` site. This reads the current value via `Cell::get`, adds one, and writes it back via `Cell::set`, so the struct field is actually updated.

**Explanation:** In Rust, a `let mut copy = self.hits` creates an independent copy of the integer on the stack. Incrementing that copy has no effect on the memory inside the struct. The developer probably intended `self.hits += 1`, but that requires `&mut self`. Without mutable access, there is no way to write back through a raw field. The fix chooses `Cell::set` because `Cell<T>` provides exactly this: mutation through a shared reference, with no runtime overhead for `Copy` types like `usize`. A related pitfall is doing the same mistake with a `String` or `Vec` — you'd get a compile error there, but with `Copy` types the silent copy is legal and the bug hides completely.

---

### Issue 2: Plain usize field incompatible with shared-reference mutation

**Problem:** `get` takes `&self` (a shared reference) because it returns a borrow into `self.scores`. A plain `usize` field cannot be mutated through `&self`, so no matter what `record_hit` tries to do, the language prevents any real write to the field without `&mut self` — which the signature forbids here.

**Fix:** Change the `hits` field declaration from `usize` to `Cell<usize>` (`CHANGE 2` sites: the field definition, `new`, and `hit_count`). `Cell::new(0)` initialises it, `Cell::get()` reads it, and `Cell::set()` writes it — all through `&self`.

**Explanation:** Rust's ownership rules say that a shared reference (`&T`) means no one may mutate the referenced data. `Cell<T>` is the standard-library escape hatch for single-threaded interior mutability: it uses `UnsafeCell` internally, which is the only way the compiler allows mutation through `&`. Because `usize` is `Copy`, `Cell` carries zero overhead — `get` copies the value out, `set` copies a new value in. If the cache needed to work across threads, `AtomicUsize` would be the equivalent choice. Choosing `Cell` here keeps the public API unchanged (both `get` and `hit_count` still take `&self` and return the expected types) while making the write-back in `record_hit` actually land on the struct field.
