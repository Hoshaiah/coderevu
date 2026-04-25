---
slug: send-sync-across-raw-pointer
track: rust
orderIndex: 91
title: Raw Pointer Wrapper Wrongly Implements Send
difficulty: hard
tags:
  - errors
  - concurrency
  - unsafe
  - send-sync
language: rust
---

## Context

`src/ffi/handle.rs` wraps a C library handle (`*mut c_void`) that is explicitly documented as safe to use from multiple threads as long as the library has been initialized with its thread-safety flag. The wrapper type `SafeHandle` implements `Send` and `Sync` so it can be stored in a `Arc` and used from a thread pool. The unsafe `impl` was added after a compiler error about raw pointers not being `Send`.

During a security audit the reviewer noted that the implementation also exposes a `get_inner_mut` method returning `*mut c_void`. A second developer later added a `RefCell<Vec<String>>` field to cache decoded strings locally on each handle — without removing the `Sync` impl. After that change, sharing a `SafeHandle` across threads started causing data races in the decoded-string cache under TSAN.

The code compiles and appears to work in single-threaded tests. The type is used directly in production across multiple threads.

## Buggy code

```rust
use std::cell::RefCell;
use std::os::raw::c_void;

pub struct SafeHandle {
    ptr: *mut c_void,
    // Per-handle cache of decoded strings; NOT thread-safe.
    cache: RefCell<Vec<String>>,
}

// SAFETY: The underlying C handle is documented as thread-safe after init.
unsafe impl Send for SafeHandle {}
unsafe impl Sync for SafeHandle {}

impl SafeHandle {
    pub fn new(ptr: *mut c_void) -> Self {
        SafeHandle {
            ptr,
            cache: RefCell::new(Vec::new()),
        }
    }

    pub fn get_inner_mut(&self) -> *mut c_void {
        self.ptr
    }

    pub fn cache_string(&self, s: String) {
        self.cache.borrow_mut().push(s);
    }
}
```
