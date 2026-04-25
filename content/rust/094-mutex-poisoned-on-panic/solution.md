## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Worker thread panics poison a shared Mutex, causing all subsequent tasks to fail
// ------------------------------------------------------------------------
use std::sync::{Arc, Mutex};
use std::thread;

pub struct Runner {
    completed: Arc<Mutex<u64>>,
}

impl Runner {
    pub fn new() -> Self {
        Runner {
            completed: Arc::new(Mutex::new(0)),
        }
    }

    pub fn run_task<F>(&self, task: F) -> Result<(), String>
    where
        F: FnOnce() + Send + 'static,
    {
        let counter = Arc::clone(&self.completed);
        thread::spawn(move || {
            // CHANGE 2: Catch a task panic so the counter increment still runs and we can report the failure rather than silently skipping it.
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(task));

            // CHANGE 1: Use into_inner() on a poisoned lock instead of unwrap(), so a prior panic does not prevent the counter from being updated.
            let mut count = match counter.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            // Only increment the counter when the task actually succeeded.
            if result.is_ok() {
                *count += 1;
            }
        });
        Ok(())
    }

    pub fn completed_count(&self) -> Result<u64, String> {
        // CHANGE 1: Recover from a poisoned mutex here too, so callers can still read the counter even after a worker thread has panicked.
        let count = match self.completed.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        Ok(*count)
    }
}
```

## Explanation

### Issue 1: Mutex poisoning breaks all future operations

**Problem:** When a spawned thread panics while holding a `Mutex` lock, Rust marks that mutex as *poisoned*. Every subsequent call to `lock()` returns `Err(PoisonError)`. Because both `run_task` and `completed_count` call `.unwrap()` on the lock result, they panic immediately after the first worker panic — no task ever runs again and `completed_count` always panics too.

**Fix:** Replace every `.lock().unwrap()` with a `match` that calls `.into_inner()` on the `Err(poisoned)` arm, as shown at the two `CHANGE 1` sites. `PoisonError::into_inner()` extracts the guard and lets execution continue normally.

**Explanation:** Mutex poisoning exists to warn you that shared state may be inconsistent because a thread died mid-update. But in this case the counter update happens *after* the task runs, so the data is not actually corrupt — the lock was never held during the panic at all (the panic happened before `lock()` was called). Even when poisoning is a legitimate concern, the right response is usually to inspect the data and decide whether to continue, not to propagate a panic chain. Using `into_inner()` clears the poisoned flag on the extracted guard, so later `lock()` calls succeed again. A related pitfall: if you hold the lock *while* calling user code that might panic, you should either drop the lock first or use `catch_unwind` around the risky section.

---

### Issue 2: Task panic silently skips the counter increment

**Problem:** If `task()` panics, the thread unwinds and the line `*count += 1` is never reached. The `completed` counter ends up lower than the number of tasks that were dispatched, with no error returned to the caller and no log entry. Under load testing this looks like tasks are being lost.

**Fix:** Wrap the `task()` call in `std::panic::catch_unwind(std::panic::AssertUnwindSafe(task))` at the `CHANGE 2` site. The counter is then incremented only when `result.is_ok()`, so a panicking task is excluded from the success count but the update path still runs.

**Explanation:** Rust's thread panics unwind the stack and skip all remaining code in that frame. Without `catch_unwind`, there is no way to run cleanup logic after a panic in the same thread. `catch_unwind` intercepts the unwind and returns a `Result`, letting you continue executing. `AssertUnwindSafe` is a wrapper that tells the compiler you accept responsibility for ensuring the captured variables are safe to use after an unwind — here the closure owns its data by move, so that is true. Note that `catch_unwind` does not catch `abort`-style panics or foreign exceptions; for those you'd need a separate watchdog or process-level supervisor.
