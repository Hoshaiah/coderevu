## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Manual Send Impl on Non-Send Type
// ------------------------------------------------------------------------

use std::sync::Mutex;

extern "C" {
    fn lib_create_handle() -> *mut u8;
    fn lib_use_handle(h: *mut u8, input: i32) -> i32;
    fn lib_destroy_handle(h: *mut u8);
}

pub struct LibHandle(*mut u8);

// CHANGE 1: Removed `unsafe impl Send for LibHandle` — the C handle mutates internal state and is not reentrant, so crossing thread boundaries without synchronisation causes data races. The type is intentionally !Send.
// CHANGE 2: `LibHandle` is now `!Send` by default because it contains a raw pointer; no explicit negative impl is needed, but wrapping access in a Mutex enforces serialised use when the value must be shared.

impl Drop for LibHandle {
    fn drop(&mut self) {
        unsafe { lib_destroy_handle(self.0); }
    }
}

// CHANGE 2: Wrap `LibHandle` in `Mutex` so that when the value is moved into a thread via `Arc<Mutex<...>>` the compiler accepts the transfer and all calls to `lib_use_handle` are serialised, preventing concurrent mutation of the handle's internal C state.
pub fn run_in_thread(input: i32) -> i32 {
    let handle = Mutex::new(LibHandle(unsafe { lib_create_handle() }));
    // CHANGE 1: `handle` is no longer sent raw across the thread boundary; the Mutex is moved into the closure, and the lock guard serialises access to the non-reentrant C function.
    let result = std::thread::spawn(move || {
        let guard = handle.lock().unwrap();
        unsafe { lib_use_handle(guard.0, input) }
    }).join().unwrap();
    result
}
```

## Explanation

### Issue 1: Unsound `Send` impl on non-reentrant handle

**Problem:** `lib_use_handle` mutates internal C state on every call and is not reentrant. The `unsafe impl Send for LibHandle` lets Rust move the raw pointer to a worker thread with no synchronisation, so two call sites can race on the same handle. Thread sanitizer catches this as a data race; at runtime it manifests as corrupted output or a segfault inside the C library.

**Fix:** Remove `unsafe impl Send for LibHandle` entirely (CHANGE 1). A type containing a `*mut u8` is `!Send` by default in Rust; deleting the impl restores that default and prevents the compiler from allowing the type to cross thread boundaries without explicit synchronisation.

**Explanation:** Rust's `Send` auto-trait is intentionally withheld from raw pointer types because the compiler cannot verify the aliasing rules of the pointed-to memory. Writing `unsafe impl Send` is a promise to the compiler that you have checked those rules yourself. Here the promise was false: "thread-safe for reads" does not imply "safe when one thread mutates". Removing the impl makes the unsound promise disappear. Any future code that tries to move a `LibHandle` into a `spawn` closure will get a compile-time error rather than a runtime crash.

---

### Issue 2: No synchronisation wrapper around the non-reentrant call

**Problem:** Even after removing the rogue `Send` impl, the `run_in_thread` function still tries to spawn a thread and call `lib_use_handle` from it. Without a way to safely transfer the handle to the thread, the code simply will not compile, and the original use case — offloading work to a thread pool — is lost.

**Fix:** Wrap `LibHandle` in a `Mutex` inside `run_in_thread` (CHANGE 2). `Mutex<T>` is `Send` when `T: Send`, but here the Mutex owns the handle on the same thread where it was created and is moved whole into the closure; the lock guard ensures that `lib_use_handle` is only ever called by one thread at a time.

**Explanation:** `Mutex` gives back the cross-thread transfer ability that was incorrectly provided by the unsound `Send` impl, but does so correctly by serialising access. The Mutex value itself is `Send` because it uses OS primitives that guarantee exclusive access. When the spawned thread locks the Mutex it gets a `MutexGuard` that dereferences to `LibHandle`, and no other thread can obtain that guard simultaneously. This matches what the C library actually guarantees: reads are fine concurrently, but `lib_use_handle`'s mutable side-effects require that only one caller runs at a time. A related pitfall: if the handle needed to be shared (not moved) across many threads, you would additionally need an `Arc<Mutex<LibHandle>>`, but for a single-use spawn a plain `Mutex` moved into the closure is sufficient.
