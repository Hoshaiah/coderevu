## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Clone Inside Spawn Shares State
// ------------------------------------------------------------------------

use std::sync::{Arc, Mutex};
use std::thread;

pub fn spawn_workers(n: usize) -> Vec<Arc<Mutex<u64>>> {
    let mut handles = Vec::new();
    let mut counters = Vec::new();

    for _ in 0..n {
        // CHANGE 1: create a fresh Arc<Mutex<u64>> inside the loop so each worker gets its own independent counter instead of all sharing one.
        let c = Arc::new(Mutex::new(0u64));
        counters.push(Arc::clone(&c));
        // CHANGE 2: store the JoinHandle so callers can observe or join worker threads if needed.
        let handle = thread::spawn(move || {
            loop {
                // ... receive and process a job ...
                *c.lock().unwrap() += 1;
                thread::sleep(std::time::Duration::from_millis(100));
            }
        });
        handles.push(handle);
    }

    counters
}
```

## Explanation

### Issue 1: Single counter shared across all workers

**Problem:** Every worker thread increments the same `u64` behind the same `Arc<Mutex<u64>>`. The health-check endpoint reads each element of `counters` and sees identical values because all elements point to the same allocation.

**Fix:** Move `Arc::new(Mutex::new(0u64))` inside the `for` loop (CHANGE 1). Each iteration now allocates a separate `Mutex<u64>`, wraps it in its own `Arc`, pushes one clone into `counters` for the caller, and moves the other clone into the spawned thread.

**Explanation:** `Arc::clone` does not copy the value inside the `Arc`; it increments a reference count and returns a pointer to the same heap allocation. When the original `counter` is created before the loop, every `Arc::clone(&counter)` inside the loop points at that one allocation. All worker threads increment the same `u64`, and the `counters` vec holds multiple `Arc`s that all dereference to the same location. Creating a new `Arc::new(...)` per iteration gives each worker a distinct heap allocation, so their counts are independent. A related pitfall: if you ever need to reset one worker's counter without affecting others, sharing a single `Arc` would make that impossible even with the right intent.

---

### Issue 2: JoinHandle discarded, workers unobservable

**Problem:** `thread::spawn` returns a `JoinHandle` that the original code immediately drops. If a worker thread panics, the caller has no way to detect it, and there is no mechanism to shut down or await the pool.

**Fix:** Assign the return value of `thread::spawn` to `handle` and push it into a `handles` vec (CHANGE 2). The handles are held for the lifetime of the function; they can be extended to the caller by returning or storing them alongside `counters`.

**Explanation:** Dropping a `JoinHandle` does not stop the thread — the thread keeps running — but it does discard the only channel through which a panic or normal exit can be observed. In a long-running dispatcher this means a crashed worker is silently lost and its slot in the pool is never refilled. Storing the handle lets calling code call `.join()` for an orderly shutdown or check `handle.is_finished()` in a watchdog loop. A related pitfall: if the process exits while handles are dropped, threads are killed mid-job; retaining handles and joining on shutdown prevents partial work.
