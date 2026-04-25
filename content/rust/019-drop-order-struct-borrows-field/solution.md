## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Drop Order Invalidates Field Reference
// ------------------------------------------------------------------------

pub struct SpanContext {
    pub name: &'static str,
    pub elapsed_us: u64,
}

pub struct SpanGuard<'ctx> {
    ctx: &'ctx mut SpanContext,
    label: &'static str,
}

impl<'ctx> SpanGuard<'ctx> {
    pub fn new(ctx: &'ctx mut SpanContext, label: &'static str) -> Self {
        SpanGuard { ctx, label }
    }
}

impl<'ctx> Drop for SpanGuard<'ctx> {
    fn drop(&mut self) {
        self.ctx.name = self.label;
        self.ctx.elapsed_us += 1;
    }
}

// CHANGE 1: Accept ctx by mutable reference instead of by value so no move of the owner is attempted while the guard's borrow is live.
// CHANGE 2: Remove the explicit `drop(guard)` — it was masking the real design issue and is unnecessary once the signature is corrected.
pub fn run_span(ctx: &mut SpanContext) {
    let guard = SpanGuard::new(ctx, "my-span");
    // Do some work
    // guard is dropped here at end of scope; borrow of ctx ends with it.
}
```

## Explanation

### Issue 1: Mutable Borrow Alive During Owner Move

**Problem:** `run_span` takes `ctx` by value (owns it), then immediately lends a `&mut` reference to `SpanGuard`. When the function later tries to `return ctx`, the compiler sees that `SpanGuard` holds a `&mut SpanContext` whose lifetime `'ctx` is tied to the local variable `ctx`. Because `SpanGuard` implements `Drop`, the compiler must call `drop` on it *before* the move, but it still classifies the borrow as potentially alive at the point of the move, producing `E0505: cannot move out of 'ctx because it is borrowed`.

**Fix:** Change the signature of `run_span` from `fn run_span(mut ctx: SpanContext) -> SpanContext` to `fn run_span(ctx: &mut SpanContext)` — the caller owns `ctx` and passes a mutable reference in. The function no longer needs to move the value out, so there is no conflict between the borrow and a move.

**Explanation:** Rust's borrow checker treats a type that implements `Drop` specially: it must keep the borrow alive until the destructor runs, because the destructor can use the borrowed data (and indeed it does here — `self.ctx.name = self.label`). When you own a value and lend `&mut` to a struct with `Drop`, you cannot move the owned value until the struct's lifetime ends. The fix removes the ownership from `run_span` entirely — the caller keeps ownership and passes a `&mut`, so there is nothing to move out. A related pitfall: even if you manually call `drop(guard)` before the `return ctx` line, the compiler's liveness analysis for types with `Drop` impls may still flag the code in older editions; removing the move resolves it definitively.

---

### Issue 2: Explicit `drop(guard)` Is Misleading

**Problem:** The code calls `drop(guard)` explicitly before `ctx` is returned, apparently to signal "the guard is done, so the borrow should be released". This does not help the compiler accept the subsequent move of `ctx` because the borrow checker's conflict is determined by lifetimes and the presence of a `Drop` impl, not by the textual position of `drop()`.

**Fix:** Remove the `drop(guard)` call entirely. In the corrected function the guard is dropped implicitly at the end of the scope, which is the idiomatic and correct pattern.

**Explanation:** `drop(guard)` moves `guard` into `std::mem::drop`, which does call the destructor immediately, but the borrow that `guard` holds on `ctx` is still described by the lifetime `'ctx` that was established when `SpanGuard::new` was called. The compiler's error is about the lifetime relationship between the `&mut ctx` borrow and the attempted move of `ctx`, not about destructor ordering at runtime. Removing `drop(guard)` and fixing the underlying ownership model (Issue 1) makes the explicit call unnecessary. Leaving redundant `drop` calls in code tends to signal to future readers that something tricky is happening, so removing it also improves clarity.
