## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Trait Object Sent Across Threads
// ------------------------------------------------------------------------

use std::thread;

pub trait Job: Send {
    // CHANGE 1: Added `Send` as a supertrait so `Box<dyn Job>` satisfies the `Send` bound required by `thread::spawn`.
    fn run(&self);
}

pub struct Dispatcher;

impl Dispatcher {
    pub fn dispatch(&self, job: Box<dyn Job>) -> thread::JoinHandle<()> {
        // CHANGE 2: Return the `JoinHandle<()>` instead of dropping it so callers can join the thread and observe panics.
        thread::spawn(move || {
            job.run();
        })
    }
}
```

## Explanation

### Issue 1: Missing `Send` Bound on `Job` Trait

**Problem:** The compiler rejects the code with `error[E0277]: 'dyn Job' cannot be sent between threads safely`. `thread::spawn` requires its closure to be `Send`, and the closure captures `job: Box<dyn Job>`. Because `dyn Job` has no `Send` bound, the compiler cannot verify it is safe to transfer ownership to another thread.

**Fix:** Add `Send` as a supertrait on `Job`: change `pub trait Job {` to `pub trait Job: Send {`. This single token addition appears at the `CHANGE 1` site.

**Explanation:** `Box<T>` is `Send` only when `T: Send`. A bare `dyn Job` erases the concrete type, so the compiler conservatively treats it as non-`Send` unless the trait itself declares that requirement. By writing `trait Job: Send`, every implementor is forced to satisfy `Send`, and the compiler can then prove `Box<dyn Job>: Send`. A related pitfall: if you also need to share a reference across threads (e.g., `Arc<dyn Job>`), you would need `trait Job: Send + Sync`.

---

### Issue 2: `JoinHandle` Silently Dropped

**Problem:** `thread::spawn` returns a `JoinHandle<()>`. Dropping it immediately detaches the thread, meaning the dispatcher has no way to know when (or whether) the job finished. If the process exits while jobs are still running, they are killed mid-execution, and any panic inside `run` is silently lost.

**Fix:** Change the return type of `dispatch` from `()` to `thread::JoinHandle<()>` and return the value produced by `thread::spawn`. This is the `CHANGE 2` site.

**Explanation:** In Rust, dropping a `JoinHandle` does not stop the thread, but it removes the only handle through which a caller could call `.join()` to wait for completion or retrieve a panic payload. Returning the handle gives callers the choice to join immediately, store it for later, or collect handles and join them in a batch. If you truly want fire-and-forget semantics, the intentional way to express that is to call `.join()` inside `dispatch` or document the detachment explicitly — not to drop the handle by accident.
