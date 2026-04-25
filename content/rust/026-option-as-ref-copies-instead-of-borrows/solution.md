## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Option Clone Instead of Borrow
// ------------------------------------------------------------------------

pub struct CacheEntry {
    key: String,
    payload: Option<Vec<u8>>,
    hits: u64,
}

impl CacheEntry {
    pub fn new(key: String, payload: Option<Vec<u8>>) -> Self {
        CacheEntry { key, payload, hits: 0 }
    }

    /// Returns a reference to the payload bytes, if present.
    // CHANGE 1: Return type changed from Option<Vec<u8>> to Option<&[u8]> so callers get a borrow, not an owned clone.
    // CHANGE 2: Body changed from self.payload.clone() to self.payload.as_deref() which yields Option<&[u8]> with zero allocation.
    pub fn peek_payload(&self) -> Option<&[u8]> {
        self.payload.as_deref()
    }

    pub fn record_hit(&mut self) {
        self.hits += 1;
    }

    pub fn hits(&self) -> u64 {
        self.hits
    }
}
```

## Explanation

### Issue 1: Hot-path heap allocation on every peek

**Problem:** Every call to `peek_payload` allocates a brand-new `Vec<u8>` on the heap by cloning the stored payload. On a read-heavy cache workload with hundred-kilobyte payloads, this shows up as a ~40% spike in allocations — each read is doing the work of a full memory copy that the cache layer was supposed to avoid.

**Fix:** Replace `self.payload.clone()` with `self.payload.as_deref()`. `as_deref` converts `Option<Vec<u8>>` to `Option<&[u8]>` by borrowing the inner `Vec` as a slice, performing no allocation.

**Explanation:** `Option::clone` on an `Option<Vec<u8>>` deep-clones the `Vec`, allocating a new buffer and copying every byte into it. The caller receives owned data it never asked to own. `as_deref` instead calls `Deref::deref` on the inner `Vec<u8>`, which is a pointer cast to `&[u8]` — it touches no allocator at all. The returned reference borrows from `self`, so the borrow checker prevents the entry from being mutated or dropped while the slice is live. A related pitfall: using `self.payload.as_ref()` would give `Option<&Vec<u8>>`, which also avoids cloning but exposes the concrete `Vec` type; `as_deref` is preferred because it gives the more general `&[u8]` slice type.

---

### Issue 2: Return type does not express zero-copy intent

**Problem:** The declared return type `Option<Vec<u8>>` promises an owned value to every caller. Even if the body were fixed to not clone, the signature itself would have to change — and any caller written against this signature would be written to receive and drop an owned `Vec`, masking the regression in code review and tests.

**Fix:** Change the return type from `Option<Vec<u8>>` to `Option<&[u8]>`. This is the CHANGE 1 site. The lifetime of the returned reference is implicitly tied to `&self`, so the compiler enforces that the entry outlives any use of the slice.

**Explanation:** In Rust, the return type is part of the function's public contract. Returning `Option<Vec<u8>>` tells the type system — and every caller — that this function produces heap-owned data. Tests that check `.unwrap() == expected_bytes` pass whether the bytes were cloned or borrowed, so the type is the only machine-checkable signal of the allocation intent. Changing to `Option<&[u8]>` makes cloning inside the body a compile error (you cannot return a local borrow of a temporary), so the zero-copy property becomes structurally enforced rather than a comment-level promise. Callers that genuinely need an owned copy can call `.map(|s| s.to_vec())` on the result, making the allocation explicit and visible at the call site.
