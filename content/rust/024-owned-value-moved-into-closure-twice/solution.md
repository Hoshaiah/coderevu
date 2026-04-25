## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Value Moved Into Closure Twice
// ------------------------------------------------------------------------

use std::thread;
use std::sync::Arc;

pub fn send_batch(recipients: Vec<String>, template: String) {
    // CHANGE 1+2: Wrap template in Arc so all threads can share one allocation instead of moving or cloning the String per thread.
    let template = Arc::new(template);
    let mut handles = vec![];
    for recipient in recipients {
        // CHANGE 1+2: Clone the Arc (cheap pointer bump) before the move closure so each thread gets its own handle to the shared data.
        let template = Arc::clone(&template);
        let handle = thread::spawn(move || {
            let body = template.replace("{{name}}", &recipient);
            println!("Sending to {}: {}", recipient, body);
        });
        handles.push(handle);
    }
    for h in handles {
        h.join().unwrap();
    }
}
```

## Explanation

### Issue 1: `template` Moved Into Closure on First Iteration

**Problem:** The `move` closure in `thread::spawn` takes ownership of every variable it captures. On the first iteration, `template` is moved into that closure. On the second iteration, the compiler sees that `template` no longer exists in the enclosing scope and emits `error[E0382]: use of moved value: 'template'`. The program never compiles.

**Fix:** Wrap `template` in `Arc::new(template)` before the loop, then call `Arc::clone(&template)` at the top of each iteration to produce a new `Arc` handle. The `move` closure captures that cloned handle rather than the original `String`, so the original `Arc` stays alive in the outer scope for the next iteration.

**Explanation:** Rust's ownership model allows a value to have exactly one owner at a time. A `move` closure becomes that sole owner for every variable it captures. Once the first closure is spawned, the outer binding `template` is gone. Producing a new `Arc` per iteration with `Arc::clone` does not copy the heap data — it increments an atomic reference count, which is a single pointer-sized integer operation. The underlying `String` data lives in one place on the heap until the last `Arc` is dropped. A related pitfall: if you reach for `Rc` instead of `Arc`, the compiler will reject it because `Rc` is not `Send` and therefore cannot cross thread boundaries.

---

### Issue 2: Per-Recipient `String` Clone Wastes Memory

**Problem:** The junior engineer's attempted fix of calling `.clone()` on `template` inside the loop compiles (aside from the move error it reintroduces), but it allocates a fresh heap copy of the entire template string — potentially several kilobytes — for each of 10,000 recipients. That is tens of megabytes of redundant allocation and copying just to share read-only data.

**Fix:** Use `Arc<String>` (introduced at `CHANGE 1+2`) so the template's heap memory is allocated exactly once. `Arc::clone` copies only the pointer and bumps an atomic counter, not the string bytes themselves.

**Explanation:** `String::clone` duplicates the entire backing buffer. For a 4 KB template and 10,000 recipients, that is ~40 MB of allocations that are immediately thrown away once each thread finishes. `Arc` solves this by giving multiple owners a shared view of one allocation. Because the template is only read (`replace` returns a new `String` rather than mutating the original), no interior mutability like `Mutex` is needed — `Arc<String>` is sufficient. One thing to watch: if the template were mutated per-thread, you would need `Arc<Mutex<String>>`, but that would introduce contention; the better design in that case would be to clone the `String` once per thread and let each thread own its copy independently.
