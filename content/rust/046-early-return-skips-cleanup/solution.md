## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Lock Guard Leak on Early Return
// ------------------------------------------------------------------------

use std::sync::{Arc, Mutex, MutexGuard};

pub struct Conn {
    pub id: u32,
}

pub struct Pool {
    conns: Arc<Mutex<Vec<Conn>>>,
}

pub struct PoolGuard {
    conn: Option<Conn>,
    pool: Arc<Mutex<Vec<Conn>>>,
}

impl Drop for PoolGuard {
    fn drop(&mut self) {
        if let Some(conn) = self.conn.take() {
            self.pool.lock().unwrap().push(conn);
        }
    }
}

impl Pool {
    pub fn checkout(&self) -> Option<PoolGuard> {
        // CHANGE 2: Clone the Arc before locking so Arc::clone cannot panic while the lock is held and after pop, preventing a connection leak.
        let pool = Arc::clone(&self.conns);
        let mut guard: MutexGuard<Vec<Conn>> = self.conns.lock().unwrap();
        if guard.is_empty() {
            return None;
        }
        let conn = guard.pop().unwrap();
        // CHANGE 1: Explicitly drop the MutexGuard before constructing PoolGuard so that PoolGuard::drop can re-acquire the lock without deadlocking.
        drop(guard);
        Some(PoolGuard {
            conn: Some(conn),
            pool,
        })
    }
}
```

## Explanation

### Issue 1: MutexGuard Outlives Checkout, Deadlocks Drop

**Problem:** Every call to `checkout` that returns a `Some(PoolGuard)` keeps the `MutexGuard` alive until the end of the function. The guard is the last expression, so Rust extends its lifetime to cover the entire `Some(PoolGuard { … })` construction. When that `PoolGuard` is later dropped — even in the same thread — `PoolGuard::drop` calls `self.pool.lock()` on the same `Mutex`. On most platforms `std::sync::Mutex` is not reentrant, so the thread blocks waiting for a lock it already holds. The connection is never returned, the mutex is never released, and the pool drains over time.

**Fix:** Insert an explicit `drop(guard)` immediately after `guard.pop()` and before the `Some(PoolGuard { … })` expression. This releases the `MutexGuard` while still inside `checkout`, so `PoolGuard::drop` can acquire the lock freely.

**Explanation:** Rust's drop order for local variables is last-in-first-out, but a value returned from a function is kept alive until the `return` (or end-of-block) expression finishes evaluating. Because `guard` is a local and the last expression is `Some(PoolGuard { conn: Some(conn), pool })`, `guard` stays alive through that construction. Calling `drop(guard)` explicitly tells the compiler to end the `MutexGuard`'s lifetime at that point. After the explicit drop, `pool.lock()` inside `PoolGuard::drop` runs against an unlocked mutex and succeeds. A related pitfall: if you move the `guard.pop()` call into an `if let` chain you can accidentally keep the guard alive even longer — always check where the last borrow of `guard` appears.

---

### Issue 2: Arc::clone Called After Pop, Before PoolGuard Wraps the Connection

**Problem:** In the original code, `guard.pop()` removes `conn` from the `Vec`, and then `Arc::clone(&self.conns)` runs. `Arc::clone` is almost never going to fail in practice, but under extreme memory pressure it can panic. If it does panic between those two lines, `conn` is moved onto the stack in a local variable, the `MutexGuard` is dropped (releasing the lock), and then the panic unwinds the stack — dropping `conn` without ever putting it back into the pool. The `PoolGuard` was never created, so its `Drop` impl never fires.

**Fix:** Move `let pool = Arc::clone(&self.conns)` to before `self.conns.lock()`, as shown at the CHANGE 2 site. The clone happens before any connection is removed from the pool, so a panic there leaves the pool intact.

**Explanation:** The window between removing a value from a shared data structure and placing it safely inside an RAII guard is dangerous. Any operation in that window that can panic — even one that looks trivial — can leak the resource. Cloning an `Arc` increments a reference count and allocates no new memory for the inner data, so moving it before the lock is both safe and semantically equivalent. After the fix, the only operations inside the lock are `is_empty()` and `pop()`, both of which are infallible, and `conn` is wrapped in `PoolGuard` immediately after `drop(guard)` with the `pool` handle already in hand.
