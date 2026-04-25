## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Condvar Wait Drops Lock Too Early
// ------------------------------------------------------------------------

use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};

pub struct Queue<T> {
    inner: Arc<(Mutex<VecDeque<T>>, Condvar)>,
}

impl<T: Send> Queue<T> {
    pub fn new() -> Self {
        Queue {
            inner: Arc::new((Mutex::new(VecDeque::new()), Condvar::new())),
        }
    }

    pub fn push(&self, item: T) {
        let (lock, cvar) = &*self.inner;
        let mut queue = lock.lock().unwrap();
        queue.push_back(item);
        drop(queue); // release lock before notifying
        cvar.notify_one();
    }

    pub fn wait_for_job(&self) -> T {
        let (lock, cvar) = &*self.inner;
        let mut queue = lock.lock().unwrap();
        // CHANGE 1: pass the already-held MutexGuard directly to cvar.wait instead of dropping it and re-locking; this closes the window between the empty check and the wait where a producer could push and notify before we sleep.
        // CHANGE 2: loop on the predicate so that spurious wakeups and races with other consumers are handled safely; pop_front is only called when the queue is known non-empty.
        while queue.is_empty() {
            queue = cvar.wait(queue).unwrap();
        }
        queue.pop_front().unwrap()
    }
}
```

## Explanation

### Issue 1: Lock Released Before `cvar.wait`, Creating Notification Race

**Problem:** Under heavy producer load, a consumer sometimes sleeps in `cvar.wait` and never wakes up even though jobs are available. Stack traces show all consumer threads blocked inside `wait_for_job`.

**Fix:** Remove the explicit `drop(queue)` and the second `lock.lock().unwrap()` before `cvar.wait`. Instead, pass the existing `MutexGuard` (`queue`) directly to `cvar.wait(queue)`, which atomically releases the lock and begins waiting (CHANGE 1).

**Explanation:** The buggy code checks `queue.is_empty()`, then drops the lock, then calls `lock.lock().unwrap()` to get a fresh guard to pass to `cvar.wait`. Between the `drop` and the moment `cvar.wait` actually suspends the thread, another thread can call `push`, release its lock, and fire `notify_one`. That notification is sent to no waiting thread (there are none yet), so it is lost. The consumer then enters `wait` and blocks indefinitely because no further notification comes. `Condvar::wait` is designed to accept an already-held `MutexGuard` precisely to make the release-and-sleep step atomic from the perspective of other threads, eliminating this window entirely.

---

### Issue 2: Missing Loop Around `cvar.wait` Predicate Check

**Problem:** Even after the first fix, if two consumer threads wake from `cvar.wait` simultaneously (e.g., one job pushed, both wake due to spurious wakeups or a prior `notify_all`), both will proceed past the `if` and call `pop_front` on a queue that the first consumer already drained, causing a `unwrap()` panic.

**Fix:** Replace the `if queue.is_empty()` block with a `while queue.is_empty()` loop that calls `cvar.wait(queue)` and re-assigns `queue` on each iteration (CHANGE 2). `pop_front` is reached only after the loop exits, guaranteeing the queue is non-empty.

**Explanation:** `Condvar::wait` can return for reasons other than a genuine notification: the OS is permitted to wake a thread spuriously, and `notify_all` wakes every waiter regardless of whether there is enough work for all of them. After waking, the thread must re-check the condition before acting on it. With a `while` loop, a thread that wakes and finds the queue empty simply waits again. Without the loop, the thread falls through and calls `pop_front().unwrap()` on an empty `VecDeque`, panicking and crashing the worker thread.
