## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Raw Pointer Wrapper Wrongly Implements Send
// ------------------------------------------------------------------------

use std::cell::RefCell;
use std::os::raw::c_void;

pub struct SafeHandle {
    ptr: *mut c_void,
    // Per-handle cache of decoded strings; NOT thread-safe.
    cache: RefCell<Vec<String>>,
}

// SAFETY: The underlying C handle is documented as thread-safe after init.
// `RefCell` is `Send` (ownership can move to another thread) but is NOT `Sync`
// (shared references across threads would cause data races in the cache).
unsafe impl Send for SafeHandle {}
// CHANGE 1: Remove `unsafe impl Sync for SafeHandle` entirely. `RefCell` is not `Sync`, so allowing shared `&SafeHandle` across threads races on the cache borrow counter. Callers that need multi-thread sharing must wrap in `Arc<Mutex<SafeHandle>>` instead.

impl SafeHandle {
    pub fn new(ptr: *mut c_void) -> Self {
        SafeHandle {
            ptr,
            cache: RefCell::new(Vec::new()),
        }
    }

    // CHANGE 2: Rename to `as_ptr` and document that the returned raw pointer aliases the stored pointer; callers must not assume exclusive ownership. / Returns the raw C handle pointer. The pointer is shared — do NOT free or / exclusively own it outside of the handle's documented lifecycle.
    pub fn as_ptr(&self) -> *mut c_void {
        self.ptr
    }

    pub fn cache_string(&self, s: String) {
        self.cache.borrow_mut().push(s);
    }
}
```

## Explanation

### Issue 1: Unsound `Sync` impl with non-thread-safe field

**Problem:** After the `RefCell<Vec<String>>` cache field was added, the `unsafe impl Sync for SafeHandle` became unsound. `RefCell` uses non-atomic borrow tracking, so two threads calling `cache_string` simultaneously race on the internal borrow counter and on the `Vec` itself. TSAN catches this; in production it silently corrupts the cache or panics with a borrow error.

**Fix:** Remove `unsafe impl Sync for SafeHandle {}` entirely (the `// CHANGE 1` site). The compiler's automatic `Sync` derivation is suppressed because `RefCell` is `!Sync`, which is exactly the right behavior here. Callers who need to share a handle across threads must wrap it in `Arc<Mutex<SafeHandle>>`.

**Explanation:** `Sync` means it is safe to have a `&T` on multiple threads simultaneously. `RefCell` achieves interior mutability using a non-atomic `isize` borrow counter; if two threads call `borrow_mut()` at the same time, both may pass the check and simultaneously write to the `Vec`, which is a data race. Rust normally refuses to auto-derive `Sync` for types containing `RefCell` for exactly this reason. Writing `unsafe impl Sync` overrides that protection and tells the compiler "trust me, it's fine" — but it isn't. Removing the impl lets the type system enforce safe usage patterns again.

---

### Issue 2: `get_inner_mut` name implies exclusive access but takes `&self`

**Problem:** `get_inner_mut` sounds like it grants mutable, exclusive access to the underlying C handle, but the method signature is `&self` and can be called on any shared reference. Multiple callers can each receive the same `*mut c_void` and pass it to C code concurrently, aliasing the pointer in ways the C library may not expect.

**Fix:** Rename the method to `as_ptr` at the `// CHANGE 2` site and add a doc comment stating that the pointer aliases the stored value and must not be freed or exclusively owned. The behavior is unchanged, but the name and documentation now match the actual semantics.

**Explanation:** The Rust convention is that `_mut` suffixes (e.g., `as_mut_ptr`, `get_mut`) signal that the caller is receiving a unique, mutable borrow. Using that convention on a `&self` method misleads readers into thinking they hold exclusive access, which can cause concurrent misuse of the raw pointer at the FFI boundary. Renaming to `as_ptr` (matching `std` conventions like `Vec::as_ptr`) immediately signals "this is a shared, non-owning view". The doc comment adds an explicit warning for the aliasing constraint so FFI callers know not to pass the pointer to any C function that expects sole ownership.

---

### Issue 3: `unsafe impl Sync` silently bypasses `RefCell`'s `!Sync` contract

**Problem:** `RefCell<T>` deliberately opts out of `Sync` so the compiler blocks multi-thread shared access. Writing `unsafe impl Sync` bypasses that opt-out without the developer noticing, because the code compiles without any warning. Single-threaded tests never exercise the concurrent path, so the problem only appears under TSAN or in production.

**Fix:** The fix is the same removal at `// CHANGE 1`: without the explicit `unsafe impl Sync`, the compiler infers `SafeHandle: !Sync` from the `!Sync` of `RefCell`, and any attempt to put a `SafeHandle` into an `Arc` and share it across threads produces a compile error pointing directly at the problem.

**Explanation:** Rust's `Send` and `Sync` auto-traits propagate negatively: if any field is `!Sync`, the containing type is `!Sync` unless you explicitly override it. The `unsafe impl` keyword exists for cases where the programmer knows more than the type system — but that knowledge must actually be correct. Here the programmer's implicit claim was "the cache is safe to share", which is false. The lesson is that every `unsafe impl Sync` or `unsafe impl Send` needs a written SAFETY comment that accounts for every field, not just the primary resource (`ptr`).
