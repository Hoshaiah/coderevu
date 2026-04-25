## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Shared LinkedList Queue Race
// ------------------------------------------------------------------------

import java.util.LinkedList;
import java.util.List;

public class WorkQueue {
    private final LinkedList<Runnable> queue = new LinkedList<>();

    public synchronized void enqueue(Runnable task) {
        queue.addLast(task);
        notifyAll();
    }

    // CHANGE 1: added `synchronized` so the LinkedList is never accessed from multiple threads at once, preventing data corruption and ConcurrentModificationException.
    // CHANGE 2: added `wait()` loop so drain() blocks until at least one task is available instead of returning an empty batch and forcing busy-polling.
    public synchronized List<Runnable> drain() throws InterruptedException {
        // CHANGE 2: wait while the queue is empty so callers block rather than spin.
        while (queue.isEmpty()) {
            wait();
        }
        List<Runnable> batch = new java.util.ArrayList<>();
        // CHANGE 1: this loop now runs under the monitor, so poll() is safe from concurrent access.
        while (!queue.isEmpty()) {
            batch.add(queue.poll());
        }
        return batch;
    }

    public synchronized int pendingCount() {
        return queue.size();
    }
}
```

## Explanation

### Issue 1: Missing synchronization on `drain()`

**Problem:** `drain()` reads and mutates `queue` without holding the object's monitor. If two worker threads call `drain()` at the same time, or if `enqueue()` runs concurrently with `drain()`, multiple threads touch the `LinkedList` simultaneously. The result is lost tasks, tasks processed twice, or an outright `ConcurrentModificationException`.

**Fix:** Add `synchronized` to the `drain()` method signature, matching the synchronization already present on `enqueue()` and `pendingCount()`.

**Explanation:** `LinkedList` is not thread-safe. The `isEmpty()` check and the subsequent `poll()` inside `drain()` are two separate steps, so another thread can remove the last element between them. Marking `drain()` as `synchronized` means a thread must hold the intrinsic lock before entering, and no other synchronized method can run at the same time. Because `enqueue()` is already `synchronized` on the same object, this single keyword closes the race. The related pitfall is assuming that calling only `synchronized` methods on a collection is enough — it is not when two method calls must be atomic together, as the check-then-act pattern here illustrates.

---

### Issue 2: `drain()` returns empty and forces busy-polling

**Problem:** When the queue is empty, `drain()` immediately returns an empty `List`. A caller that loops calling `drain()` will spin at 100% CPU indefinitely until a task arrives. This wastes CPU time and can starve the producer thread or other workers on single- or dual-core machines.

**Fix:** Replace the unconditional loop with a `while (queue.isEmpty()) { wait(); }` block at the start of `drain()`, and add `throws InterruptedException` to the signature. `enqueue()` already calls `notifyAll()`, so waiting threads wake up as soon as a task is added.

**Explanation:** The `Object.wait()` call releases the monitor and suspends the thread until another thread calls `notify()` or `notifyAll()` on the same object. When `enqueue()` adds a task and calls `notifyAll()`, all waiting `drain()` threads wake, re-acquire the lock one at a time, and check `queue.isEmpty()` again (the `while` rather than `if` guards against spurious wakeups and the case where multiple waiters wake but only one task was added). Without this, the calling code must implement its own sleep-retry loop, which either introduces unnecessary latency or wastes CPU — neither is acceptable in a task queue.
