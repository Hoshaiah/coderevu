## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Channel Sender Kept Alive Forever
// ------------------------------------------------------------------------

use std::sync::mpsc;
use std::thread;

pub fn run_workers(jobs: Vec<String>) {
    let (tx, rx) = mpsc::channel::<String>();
    let rx = std::sync::Arc::new(std::sync::Mutex::new(rx));

    let mut handles = Vec::new();
    for _ in 0..4 {
        let rx_clone = rx.clone();
        // CHANGE 1: removed `tx.clone()` — workers must not hold a sender copy or the channel never closes
        handles.push(thread::spawn(move || {
            loop {
                let job = rx_clone.lock().unwrap().recv();
                match job {
                    Ok(j) => println!("Processing: {}", j),
                    Err(_) => break, // channel closed
                }
            }
        }));
    }

    for job in jobs {
        tx.send(job).unwrap();
    }

    // CHANGE 2: drop `tx` here so the channel closes and workers' `recv()` returns `Err`, letting them exit
    drop(tx);

    for h in handles {
        h.join().unwrap();
    }
}
```

## Explanation

### Issue 1: Worker threads hold extra sender clones

**Problem:** Every worker thread receives a clone of `tx` and stores it in `_keep_alive`. Because each clone counts as a live sender, the `mpsc` channel never observes zero senders while any worker is running. Workers sit blocked on `recv()` waiting for a message that will never arrive, and `join()` waits on those threads forever.

**Fix:** Remove the `tx.clone()` call and the `_keep_alive` binding entirely from the spawn closure. The reference solution deletes both lines, so no sender copy enters any worker thread.

**Explanation:** An `mpsc` channel delivers `Err` from `recv()` only when every `Sender` (and every `SyncSender`) has been dropped. Each `clone()` creates an independent sender with its own reference count. As long as a worker holds `tx_clone`, that count stays above zero. The workers themselves are the entities that should terminate the loop, but they are also holding open the very signal they are waiting for — a circular dependency. Removing the clone breaks the cycle: once the dispatcher is done sending, only the original `tx` remains, and dropping it is sufficient to close the channel.

---

### Issue 2: Original sender not dropped before joining

**Problem:** Even after removing the per-worker clones, the original `tx` in `run_workers` stays alive through the entire `for h in handles` loop. A sender outliving the join loop means the channel is technically still open while the code waits for workers to finish, so if the clone bug were the only fix applied the behavior would depend on timing and could still hang in edge cases.

**Fix:** Add an explicit `drop(tx)` call immediately after the job-sending loop and before the `join` loop. This is the `// CHANGE 2` site in the reference solution.

**Explanation:** Rust drops local variables at the end of their enclosing scope, which here is the end of `run_workers`. The join loop runs before that end, so `tx` is still alive while the code blocks on `h.join()`. Workers are waiting for `recv()` to return `Err`, but `recv()` returns `Err` only when all senders drop, and `tx` has not dropped yet — a deadlock. Calling `drop(tx)` explicitly moves the drop point to before the joins, so workers see the closed channel, exit their loops, and the joins complete. A related pitfall: if `tx` were wrapped in an `Option` and you forgot to call `.take()` before joining, you would hit the exact same hang even with clean worker code.
