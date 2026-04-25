## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — wait Called Without Holding Monitor
// ------------------------------------------------------------------------

public class DataLatch {
    private volatile Object payload;
    private final Object lock = new Object();

    public void publish(Object data) {
        synchronized (lock) {
            this.payload = data;
            lock.notifyAll();
        }
    }

    public Object await() throws InterruptedException {
        // CHANGE 1 & 2: wrap the loop in synchronized(lock) so wait() is called while holding the monitor, and so the null-check + wait() are atomic with respect to publish().
        synchronized (lock) {
            while (payload == null) {
                lock.wait();
            }
        }
        return payload;
    }
}
```

## Explanation

### Issue 1: `wait()` Called Without Monitor Ownership

**Problem:** Consumer threads that call `await()` crash with `IllegalMonitorStateException: current thread is not owner`. This happens every time `lock.wait()` is reached, not just under concurrency — but the exception surfaces intermittently in practice because threads that find `payload` already non-null skip the `wait()` call entirely.

**Fix:** Wrap the `while` loop in `synchronized (lock)` at the CHANGE 1 site in `await()`. Now `lock.wait()` is always called while the calling thread holds the `lock` monitor, which is what the JVM requires.

**Explanation:** The Java specification requires a thread to own an object's monitor before it can call `wait()`, `notify()`, or `notifyAll()` on that object. Ownership is acquired by entering a `synchronized` block on the same object. Without `synchronized (lock)` in `await()`, no monitor is held when `lock.wait()` executes, so the JVM throws `IllegalMonitorStateException` unconditionally. The developer was misled because `publish()` does use `synchronized (lock)` — but that only covers the producer thread's calls to `notifyAll()`, not the consumer thread's call to `wait()`. Declaring `payload` as `volatile` provides visibility across threads but has nothing to do with monitor ownership.

---

### Issue 2: Race Between Null-Check and `wait()` Can Cause Missed Notification

**Problem:** Even if the `IllegalMonitorStateException` is fixed by holding the monitor only around `lock.wait()` but not around the `while (payload == null)` check, a consumer can miss the `notifyAll()` signal and block indefinitely. In a request-coalescing layer where `publish()` is called exactly once, a stuck consumer means the calling thread hangs permanently.

**Fix:** The `synchronized (lock)` block at the CHANGE 2 site wraps both the `while (payload == null)` condition check and the `lock.wait()` call together, making them atomic with respect to `publish()`.

**Explanation:** Without the enclosing `synchronized` block, a consumer thread can read `payload == null` as `true`, then be preempted. The producer thread then enters `synchronized (lock)`, sets `payload`, calls `notifyAll()` (which has no listeners yet), and exits. Now the consumer resumes, calls `lock.wait()`, and waits for a notification that already fired — it never wakes up. Holding `lock` across both the condition check and `wait()` prevents this: while the consumer holds the monitor, `publish()` cannot enter `synchronized (lock)` and send `notifyAll()` until after `lock.wait()` is called, which atomically releases the monitor and registers the thread as a waiter. Using a `while` loop rather than `if` is also correct here to guard against spurious wakeups.
