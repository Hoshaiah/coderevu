## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Lock Never Released After Exception
// ------------------------------------------------------------------------

import java.util.concurrent.locks.ReentrantLock;

public class InventoryService {
    private final ReentrantLock lock = new ReentrantLock();
    private int stock;

    public InventoryService(int initialStock) {
        this.stock = initialStock;
    }

    public boolean updateStock(int delta) {
        lock.lock();
        try {
            int newStock = stock + delta;
            if (newStock < 0) {
                return false;
            }
            persistToDatabase(newStock); // may throw RuntimeException
            stock = newStock;
            return true;
        } catch (RuntimeException e) {
            throw e;
        } finally {
            // CHANGE 1: move lock.unlock() into the finally block so it runs on every exit path, including exceptions
            // CHANGE 2: replace the empty finally body with the actual unlock call, making the cleanup intent explicit and correct
            lock.unlock();
        }
    }

    private void persistToDatabase(int value) {
        // Simulates a flaky DB call
        if (Math.random() < 0.01) throw new RuntimeException("DB error");
    }
}
```

## Explanation

### Issue 1: Lock Never Released on Exception

**Problem:** When `persistToDatabase` throws a `RuntimeException`, the `catch` block re-throws it. The `finally` block is empty, so `lock.unlock()` is never called. Every subsequent call to `updateStock` blocks forever waiting to acquire a lock that will never be released, freezing the entire thread pool.

**Fix:** Add `lock.unlock()` inside the `finally` block (CHANGE 1). This guarantees the lock is released regardless of whether the method returns normally or throws.

**Explanation:** A `finally` block runs on every exit from the `try` — normal return, caught exception, or uncaught exception. Placing `lock.unlock()` there means no code path can skip it. Without this, a single transient `RuntimeException` leaves the lock acquired forever by the thread that threw. Any other thread calling `lock.lock()` then blocks indefinitely. A related pitfall: if you call `lock.unlock()` only after the `try/catch` (outside the `finally`), an uncaught exception still bypasses it — the `finally` block is the only safe location.

---

### Issue 2: Empty finally Block Creates False Impression of Correctness

**Problem:** The original code has a comment inside the `finally` block saying "unlock is only reached on normal return", and a second comment below the method saying `lock.unlock()` is missing. The `finally` block itself does nothing. Any reviewer scanning quickly sees a `finally` and assumes cleanup is handled.

**Fix:** Replace the empty `finally` body and its misleading comment with the actual `lock.unlock()` call (CHANGE 2), removing the dead comment below the method as well.

**Explanation:** An empty `finally` block provides no protection. The original comment acknowledges the bug but does not fix it, which makes the code actively misleading — a reviewer sees the `try/finally` structure and may not notice that the block body is empty. Putting `lock.unlock()` directly in the `finally` block is the standard Java idiom for `ReentrantLock` usage (mirroring how `synchronized` works), and it makes the intent unambiguous to anyone reading the code later.
