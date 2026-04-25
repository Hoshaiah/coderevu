---
slug: phantom-data-variance-unsound
track: rust
orderIndex: 15
title: Missing PhantomData Breaks Variance
difficulty: hard
tags:
  - lifetimes
  - ownership
  - unsafe
language: rust
---

## Context

This code is in `src/ffi/buffer.rs`, a thin wrapper around a raw pointer to an externally-allocated byte buffer used when interfacing with a C library. The wrapper is intended to act like a `&'a [u8]` — it should be covariant in `'a` and should not outlive the buffer. It is marked `Copy` because raw pointers are `Copy`.

A code reviewer flagged the struct as unsound: the lifetime `'a` appears only in a `PhantomData` field, but the field is missing. Without it, Rust drops the lifetime from the struct's variance analysis entirely, allowing the compiler to accept code that hands a `BorrowedBuffer` with a short lifetime where a longer lifetime is expected — a potential use-after-free.

The reviewer also noted that `Send` and `Sync` are unconditionally derived, which is unsound for a type wrapping a raw pointer to data it does not own.

## Buggy code

```rust
use std::marker::PhantomData;

// BUG 1: The struct has a lifetime parameter 'a but does not include
// PhantomData<&'a u8> (or similar). The lifetime is unused in any field,
// so rustc drops it and the type is not properly constrained by 'a.
// BUG 2: Deriving Send + Sync is unsound for a raw-pointer wrapper;
// the underlying data's thread-safety is not guaranteed.
#[derive(Copy, Clone, Debug)]
pub struct BorrowedBuffer<'a> {
    ptr: *const u8,
    len: usize,
    // Missing: _marker: PhantomData<&'a u8>,
}

impl<'a> BorrowedBuffer<'a> {
    /// # Safety
    /// `ptr` must point to at least `len` valid bytes that live for `'a`.
    pub unsafe fn from_raw(ptr: *const u8, len: usize) -> Self {
        BorrowedBuffer { ptr, len }
    }

    pub fn as_slice(&self) -> &[u8] {
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }
}

unsafe impl<'a> Send for BorrowedBuffer<'a> {}
unsafe impl<'a> Sync for BorrowedBuffer<'a> {}
```
