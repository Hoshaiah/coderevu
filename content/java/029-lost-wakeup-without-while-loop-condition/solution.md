## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Spurious Wakeup in wait Without Loop
// ------------------------------------------------------------------------

import java.util.LinkedList;

public class WorkQueue {
    private final LinkedList<Runnable> jobs = new LinkedList<>();
    private final Object lock = new Object();

    public void enqueue(Runnable job) {
        synchronized (lock) {
            jobs.addLast(job);
            lock.notifyAll();
        }
    }

    public Runnable dequeue() throws InterruptedException {
        synchronized (lock) {
            // CHANGE 1: replaced if(...) with while(...) so the empty-queue condition is re-checked every time wait() returns, guarding against spurious wakeups and multi-consumer races.
            while (jobs.isEmpty()) {
                lock.wait();
            }
            return jobs.removeFirst();
        }
    }
}
```

## Explanation

### Issue 1: Spurious Wakeup Bypasses Empty-Queue Guard

**Problem:** The consumer calls `wait()` inside an `if` block. When `wait()` returns — even without a matching `notify` — the code immediately falls through to `removeFirst()`. In production, `jobs` is still empty at that point, so `removeFirst()` throws `NoSuchElementException`. This happens roughly once per 10,000 dequeues because spurious wakeups are rare but permitted by the Java Memory Model and the underlying OS thread primitives.

**Fix:** Replace `if (jobs.isEmpty())` with `while (jobs.isEmpty())` at the CHANGE 1 site. After `wait()` returns for any reason, the loop re-evaluates `jobs.isEmpty()` and calls `wait()` again if the queue is still empty.

**Explanation:** The Java specification (and POSIX `pthread_cond_wait` underneath) explicitly states that `Object.wait()` may return even when no thread called `notify` or `notifyAll`. This is called a spurious wakeup. With `if`, the guard runs exactly once before the first `wait()`, so a spurious wakeup exits the waiting block unconditionally. With `while`, the condition is tested again every time `wait()` returns, so the thread only proceeds when a job is actually present. The same `while` loop also handles a subtler scenario: if two consumer threads were ever added and a single job is enqueued, `notifyAll()` wakes both; the first takes the job, and the second must loop back and wait again rather than crash on an empty queue.

---

### Issue 2: notifyAll() With a Single Item Enables Multi-Consumer Race

**Problem:** `enqueue` calls `notifyAll()`, which wakes every thread waiting on `lock`. If a second consumer thread is ever introduced (even temporarily during a refactor), both threads can pass the `if`-check simultaneously — each sees a non-empty queue — and both call `removeFirst()`. The second call hits an empty list and throws `NoSuchElementException`.

**Fix:** The `while` loop added at CHANGE 1 also closes this race. Each woken consumer thread re-checks `jobs.isEmpty()` after acquiring the lock; only the thread that finds the queue non-empty proceeds to `removeFirst()`.

**Explanation:** `notifyAll()` is correct and conservative: it ensures no consumer sleeps indefinitely if a notification is missed. The danger is not in `notifyAll()` itself but in assuming each woken thread will find the condition satisfied. With `while`, every thread that resumes from `wait()` competes for the lock, re-evaluates the condition under that lock, and either takes a job or loops back to `wait()`. This pattern — always loop, always recheck — is the standard Java idiom for condition waits and is documented in `Object.wait()`'s Javadoc.
