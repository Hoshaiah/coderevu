## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — MutexGuard Held Across Await Point
// ------------------------------------------------------------------------

// Requires: tokio = { version = "1", features = ["full"] }
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub hit_count: Mutex<u64>,
}

pub async fn handle_request(state: Arc<AppState>) -> String {
    // CHANGE 1: Lock, increment, copy the value, then drop the guard — all before the await point — so the Mutex is never held while the task is suspended.
    let current = {
        let mut count = state.hit_count.lock().unwrap();
        *count += 1;
        let current = *count;
        current
        // guard `count` is dropped here at the end of the block, before any await
    };

    // CHANGE 2: The await now occurs with no MutexGuard live, eliminating the cross-await hold that caused the deadlock.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    format!("hit #{}", current)
}
```

## Explanation

### Issue 1: MutexGuard Held Across Await Point

**Problem:** Under concurrent load, all Tokio worker threads stall and requests time out. A profiler shows every thread blocked on `Mutex::lock`. The service appears healthy in sequential tests but deadlocks in production with as few as two concurrent requests per thread.

**Fix:** Wrap the lock, increment, and copy inside a plain block `{ ... }` so the guard `count` is dropped at the closing brace — before `tokio::time::sleep(...).await` is reached. The copied `u64` value `current` escapes the block and is used in the response.

**Explanation:** `std::sync::Mutex` is a blocking primitive: it does not know about async tasks. When a task calls `.await`, Tokio may park it and schedule a different task on the same OS thread. If that second task also calls `handle_request`, it immediately calls `Mutex::lock`, which blocks the thread in the kernel — the only thread available to drive the first task forward and eventually release the guard. With 4 threads and enough concurrent requests, every thread ends up blocked this way and no progress is ever made. Dropping the guard before the await breaks the cycle: the lock is free for the next task before the thread suspends. An important related pitfall is that placing `drop(count)` after the `.await` (as the buggy code does) does not help at all — the Rust borrow checker considers the guard live for its entire lexical scope, and the guard already crossed the suspension point.

---

### Issue 2: Misplaced `drop` After Await

**Problem:** The original code calls `drop(count)` after the `.await`, apparently intending to release the lock promptly, but by that point the guard has already been held across the suspension and any damage is done during the await itself.

**Fix:** Remove the explicit `drop(count)` call entirely and instead let the guard go out of scope at the end of the inner block introduced in CHANGE 1. There is no longer a guard variable in scope at or after the await.

**Explanation:** Rust's `MutexGuard` releases the lock in its `Drop` impl, which runs when the value goes out of scope. Scope is determined lexically: a variable declared with `let` lives until the end of its enclosing block, not until the line where you call `drop`. In the buggy code `count` is declared in the function body, so it lives until the function returns — the manual `drop` after the await is equivalent to where the compiler would have dropped it anyway. Moving the declaration into a shorter inner block makes the scope end before the `.await` expression is evaluated, which is the only placement that prevents the guard from crossing the suspension point.
