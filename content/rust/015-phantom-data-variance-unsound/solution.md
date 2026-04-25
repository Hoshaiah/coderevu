## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Missing PhantomData Breaks Variance
// ------------------------------------------------------------------------

use std::marker::PhantomData;

#[derive(Copy, Clone, Debug)]
pub struct BorrowedBuffer<'a> {
    ptr: *const u8,
    len: usize,
    // CHANGE 1: Add PhantomData<&'a u8> so the lifetime 'a participates in variance analysis, making BorrowedBuffer covariant in 'a and preventing it from outliving the referenced buffer.
    _marker: PhantomData<&'a u8>,
}

impl<'a> BorrowedBuffer<'a> {
    /// # Safety
    /// `ptr` must point to at least `len` valid bytes that live for `'a`.
    pub unsafe fn from_raw(ptr: *const u8, len: usize) -> Self {
        // CHANGE 1: Initialize the new _marker field in the constructor.
        BorrowedBuffer { ptr, len, _marker: PhantomData }
    }

    pub fn as_slice(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }
}

// CHANGE 2: Remove the blanket Send and Sync impls; raw-pointer wrappers are not automatically thread-safe, so rustc must not assume they are.
```

## Explanation

### Issue 1: Missing PhantomData Breaks Lifetime Variance

**Problem:** The struct declares `'a` as a lifetime parameter but no field actually uses it. Rust's variance system only tracks a lifetime when it appears in at least one field. Without `PhantomData<&'a u8>`, the compiler treats `'a` as unconstrained and accepts a `BorrowedBuffer<'short>` anywhere a `BorrowedBuffer<'long>` is expected, even after the underlying buffer has been freed.

**Fix:** Add a field `_marker: PhantomData<&'a u8>` to the struct and initialize it with `PhantomData` in `from_raw`. This is the only change to the struct definition and constructor.

**Explanation:** Rust computes variance (covariant, contravariant, invariant) per type parameter by inspecting every field. A lifetime that appears in no field contributes nothing to that computation. `PhantomData<&'a u8>` is a zero-sized type that carries no runtime cost but tells the compiler "this struct borrows a `u8` for `'a`", making the struct covariant in `'a`. Covariance means a `BorrowedBuffer<'long>` can be used where `BorrowedBuffer<'short>` is needed, but not the reverse — which is exactly the semantics of `&'a [u8]`. Without this field, the lifetime check is silently skipped, and code that stores a `BorrowedBuffer` past the end of the buffer's lifetime can compile without error.

---

### Issue 2: Unsound Blanket Send and Sync Impls

**Problem:** The two `unsafe impl` blocks mark `BorrowedBuffer` as both `Send` (safe to move to another thread) and `Sync` (safe to share a reference across threads) unconditionally. Because the type wraps a raw pointer to memory it does not own, nothing in this crate controls whether that memory is actually safe to access from multiple threads.

**Fix:** Remove the `unsafe impl<'a> Send for BorrowedBuffer<'a> {}` and `unsafe impl<'a> Sync for BorrowedBuffer<'a> {}` blocks entirely. With a `*const u8` field, rustc automatically marks the type `!Send` and `!Sync`, which is the correct conservative default.

**Explanation:** When a struct contains a raw pointer, Rust deliberately does not derive `Send` or `Sync` automatically, because the compiler cannot know whether the pointee is shared, owned, or protected by a lock. The `unsafe impl` blocks in the buggy code override that conservative default without any justification. A caller could construct a `BorrowedBuffer` from a pointer into a non-thread-safe C structure and then send it to another thread, causing a data race. Removing the impls restores the default `!Send + !Sync` behavior; any downstream crate that genuinely needs thread safety can add a justified `unsafe impl` with a documented safety contract.
