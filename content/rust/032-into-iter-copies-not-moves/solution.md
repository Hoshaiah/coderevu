## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — into_iter on Copy Type Copies
// ------------------------------------------------------------------------

pub struct Invoice {
    pub line_items: Vec<f64>,
    pub total: f64,
}

pub fn build_invoice(amounts: Vec<f64>, discount: f64) -> Invoice {
    // CHANGE 1: Use `.into_iter()` instead of `.iter()` so `amounts` is consumed here and cannot be used afterwards.
    let discounted: Vec<f64> = amounts
        .into_iter()
        .map(|a| a * (1.0 - discount))
        .collect();

    // CHANGE 2: The post-use `amounts.into_iter().collect()` line is removed; `amounts` is already moved above, making this line the enforcement of the consume-on-use invariant.

    let total = discounted.iter().sum();
    Invoice {
        line_items: discounted,
        total,
    }
}
```

## Explanation

### Issue 1: `.iter()` borrows instead of consuming

**Problem:** The original code calls `.iter()` on `amounts`, which produces an iterator over shared references (`&f64`). This is a borrow, not a move, so `amounts` remains fully owned and valid after the iterator is dropped. The subsequent `amounts.into_iter().collect()` line compiles without error and returns the original undiscounted values, because `amounts` was never consumed.

**Fix:** Replace `.iter()` with `.into_iter()` on the `amounts` vec at the first use site (the `discounted` mapping). Also change the closure parameter from `|&a|` to `|a|` because `into_iter()` on a `Vec<f64>` yields owned `f64` values, not references.

**Explanation:** `Vec<T>` has three iterator methods: `.iter()` yields `&T` (borrows), `.iter_mut()` yields `&mut T` (mutable borrows), and `.into_iter()` yields `T` and consumes the `Vec`. When you call `.iter()`, the borrow checker sees a temporary borrow that ends when the iterator is dropped — the vec is untouched. Switching to `.into_iter()` transfers ownership of the `Vec` into the iterator, so the compiler records `amounts` as moved and refuses any later use of it. A related pitfall: if the element type is `Copy` (like `f64`), `into_iter()` still moves the `Vec` itself even though the individual values are copied out, so the owned container is gone even if the bits are cheap to duplicate.

---

### Issue 2: Post-use line gives false confidence due to `Copy` semantics

**Problem:** Even after fixing the iterator method, a developer might add a check like `let _check: Vec<f64> = amounts.into_iter().collect();` after the main loop and expect a compile error proving `amounts` is gone. Because `f64: Copy`, any accidental re-use of elements would silently copy them rather than move them, making "did I consume this?" checks unreliable when left in production code.

**Fix:** The redundant `let _check` line is removed entirely. Consuming `amounts` inside the `discounted` mapping (CHANGE 1) is the single authoritative place where ownership transfers, and no secondary assertion is needed.

**Explanation:** `Copy` types let the compiler implicitly duplicate a value whenever it would otherwise be moved. For a `Vec<f64>`, the `Vec` container itself is not `Copy` (heap allocation prevents it), but the individual `f64` elements are. This means iterating with `.iter()` and dereferencing each `&f64` produces a copied `f64` with zero compiler complaint. The original vec lives on. The correct invariant to enforce is that the `Vec` is consumed — which only `.into_iter()` on the container achieves. Leaving a post-use assertion in place creates a false sense of safety: it compiles and runs, but it only catches the case where `amounts` itself was not moved, not the subtler case where element values were silently copied out.
