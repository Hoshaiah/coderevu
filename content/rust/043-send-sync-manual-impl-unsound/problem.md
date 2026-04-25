---
slug: send-sync-manual-impl-unsound
track: rust
orderIndex: 43
title: Manual Send Impl on Non-Send Type
difficulty: hard
tags:
  - ownership
  - concurrency
  - unsafe
language: rust
---

## Context

This snippet is in `src/ffi/handle.rs`. The codebase wraps a C library that allocates handles via `lib_create_handle()` and frees them with `lib_destroy_handle()`. The handle is represented as a raw pointer. A developer added `unsafe impl Send` so the handle could be sent to a worker thread pool, arguing that the C library documentation says handles are "thread-safe for read operations".

The service intermittently corrupts data and occasionally segfaults inside the C library. The crashes are not reproducible in single-threaded tests. Thread sanitizer reports a data race on the handle pointer. The C library documentation actually says handles are safe for *concurrent reads*, but `lib_use_handle` **mutates internal state** and is not reentrant.

The developer's fix of adding a `Mutex` wrapper was reverted because "the C library is already thread-safe". The real bug is the unsafe `Send` impl on a type that wraps a pointer to non-thread-safe mutable state.

## Buggy code

```rust
use std::thread;

extern "C" {
    fn lib_create_handle() -> *mut u8;
    fn lib_use_handle(h: *mut u8, input: i32) -> i32;
    fn lib_destroy_handle(h: *mut u8);
}

pub struct LibHandle(*mut u8);

// UNSAFE: the C library mutates handle state; this impl is unsound.
unsafe impl Send for LibHandle {}

impl Drop for LibHandle {
    fn drop(&mut self) {
        unsafe { lib_destroy_handle(self.0); }
    }
}

pub fn run_in_thread(input: i32) -> i32 {
    let handle = LibHandle(unsafe { lib_create_handle() });
    let result = thread::spawn(move || {
        unsafe { lib_use_handle(handle.0, input) }
    }).join().unwrap();
    result
}
```
