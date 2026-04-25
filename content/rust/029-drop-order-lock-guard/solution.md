## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Lock Guard Dropped Too Late
// ------------------------------------------------------------------------

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

pub struct Job {
    pub id: u64,
    pub payload: Vec<u8>,
}

pub struct Processor {
    queue: Arc<Mutex<VecDeque<Job>>>,
}

impl Processor {
    pub fn enqueue(&self, job: Job) {
        self.queue.lock().unwrap().push_back(job);
    }

    pub fn process_next(&self) {
        // CHANGE 1: Pop the job inside a short inner scope so the guard is dropped before do_expensive_work runs.
        let job = {
            // CHANGE 2: The guard is bound only for this block; it is dropped at the closing brace, releasing the lock immediately after pop_front.
            self.queue.lock().unwrap().pop_front()
        };
        if let Some(job) = job {
            do_expensive_work(&job);
        }
    }
}

fn do_expensive_work(job: &Job) {
    // Simulates hundreds of milliseconds of CPU/IO work.
    let _ = job.payload.len();
}
```

## Explanation

### Issue 1: Lock held during expensive work

**Problem:** The `Mutex` guard returned by `self.queue.lock().unwrap()` lives until the end of the enclosing `if let` block. Because `do_expensive_work` is called inside that block, the lock is held for its entire duration — potentially hundreds of milliseconds. Any other thread calling `enqueue` blocks on `lock()` for that whole time, which under load appears as a deadlock.

**Fix:** The `pop_front` call is moved into a dedicated inner block `{ self.queue.lock().unwrap().pop_front() }`. The guard is a temporary that is dropped at the closing brace of that block, well before `do_expensive_work` is called.

**Explanation:** In Rust, a temporary value's lifetime extends to the end of the statement or block it is created in unless you explicitly shorten it. In the original code `if let Some(job) = self.queue.lock().unwrap().pop_front()`, the guard is a temporary in the `if let` statement, so the compiler keeps it alive for the whole `if let` body. Wrapping just the `lock().pop_front()` call in its own `{ }` block forces the guard to be dropped when that block ends, which is before `do_expensive_work` starts. After this change, the lock is held only for the microseconds needed to call `pop_front`, so `enqueue` can acquire it freely while expensive work is in progress. A related pitfall: binding the guard to a named `let` variable before the `if let` has the same lifetime problem — you need a separate scope, not just a separate variable.

---

### Issue 2: No explicit scope boundary for guard lifetime

**Problem:** The developer expected `pop_front` to consume the guard immediately, leaving the lock free. Rust does not drop temporaries early just because their value has been "used" — the guard stays alive until the enclosing statement ends. The symptom is that the worker thread holds the lock continuously, and the web handler thread stalls on every request.

**Fix:** An inner block `{ ... }` is introduced around `self.queue.lock().unwrap().pop_front()` (the `CHANGE 2` site). The block's closing brace is the drop point for the guard, making the lock release deterministic and immediate.

**Explanation:** Rust's borrow checker ties temporary lifetimes to lexical scopes. A block expression `{ expr }` creates a scope whose temporaries are dropped when the block ends and its value is returned. By evaluating `lock().unwrap().pop_front()` inside such a block and binding only the `Option<Job>` result to `job`, the guard never escapes the block. This pattern is idiomatic for situations where you need data out of a locked structure but want to release the lock before doing further work with that data. Forgetting this and instead doing `let guard = self.queue.lock().unwrap(); let job = guard.pop_front();` would have exactly the same problem because `guard` lives until end of the enclosing function.
