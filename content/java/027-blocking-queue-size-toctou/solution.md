## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — BlockingQueue Size Check Race Condition
// ------------------------------------------------------------------------

import java.util.concurrent.LinkedBlockingQueue;

public class BoundedTaskQueue {
    private final LinkedBlockingQueue<Runnable> queue = new LinkedBlockingQueue<>();
    private final int maxSize;

    public BoundedTaskQueue(int maxSize) {
        this.maxSize = maxSize;
    }

    // CHANGE 1: wrap the check-and-add in a synchronized block so the size check and queue.add() execute atomically, eliminating the race condition.
    public synchronized boolean enqueue(Runnable task) {
        if (queue.size() < maxSize) {
            queue.add(task);
            return true;
        }
        return false;
    }

    public Runnable dequeue() throws InterruptedException {
        return queue.take();
    }
}
```

## Explanation

### Issue 1: Check-then-act Race Condition

**Problem:** Under burst traffic, multiple producer threads all call `enqueue` at the same moment. Each thread reads `queue.size()`, sees a value below `maxSize`, and proceeds to call `queue.add()`. All of them add a task even though collectively they push the queue well past the configured limit. The monitoring dashboard shows the queue reaching two or three times `maxSize`.

**Fix:** The `enqueue` method is declared `synchronized` (see `// CHANGE 1`). This makes the size check and `queue.add()` execute as a single atomic critical section, so only one thread at a time can inspect the size and conditionally add.

**Explanation:** `queue.size() < maxSize` and `queue.add(task)` are two separate operations. Between the moment thread A reads the size and the moment it calls `add`, thread B (and C, D, …) can also read the same size value and also decide to add. `LinkedBlockingQueue` is thread-safe for individual operations, but it provides no atomicity guarantee across a `size()` read followed by an `add()` — those are two independent method calls. Adding `synchronized` to `enqueue` means the JVM holds the intrinsic lock on the `BoundedTaskQueue` instance for the entire body of the method, so threads queue up and only one executes at a time. A relevant pitfall: if `dequeue` also needed to signal producers (e.g., to unblock a full queue), you would need `wait()`/`notifyAll()` inside the same synchronized block; here `queue.take()` blocks internally so that path remains safe without additional synchronization.

---

### Issue 2: Non-atomic Size Enforcement

**Problem:** The developer assumed that because `LinkedBlockingQueue` is thread-safe, the combination of `queue.size()` and `queue.add()` is also thread-safe as a unit. It is not. Each call is individually safe, but the sequence is not, which is exactly the mechanism behind the burst overflow.

**Fix:** Declaring `enqueue` as `synchronized` (the same `// CHANGE 1` site) is the fix for both issues: it promotes the two-step check-and-add into a single atomic operation visible to all threads.

**Explanation:** `LinkedBlockingQueue`'s thread-safety guarantee means that calling `size()` will return a consistent snapshot and calling `add()` will not corrupt the internal data structure, but it does not mean that the value returned by `size()` is still valid by the time `add()` executes. Another thread can modify the queue between those two calls. The `synchronized` keyword on the method uses the instance's monitor, so any thread entering `enqueue` must acquire that lock first. Because the lock covers both the `size()` call and the `add()` call, no other thread can change the queue's size in between. An alternative fix would be to use an `AtomicInteger` counter incremented with `compareAndSet`, but `synchronized` is simpler and correct here given that `enqueue` is the only write path.
