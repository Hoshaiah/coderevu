## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Iterator Shared Across Threads
// ------------------------------------------------------------------------

import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class ParallelBatchProcessor {
    private final ExecutorService pool = Executors.newFixedThreadPool(8);

    public void process(List<Record> snapshot) throws InterruptedException {
        Iterator<Record> it = snapshot.iterator();
        // CHANGE 1: Wrap the hasNext()+next() pair in a synchronized block so no two threads can interleave calls on the shared iterator; the record is captured inside the lock but handled outside it to keep parallel throughput.
        while (true) {
            final Record record;
            synchronized (it) {
                if (!it.hasNext()) break;
                record = it.next();
            }
            pool.submit(() -> handle(record));
        }
        pool.shutdown();
        pool.awaitTermination(1, TimeUnit.HOURS);
    }

    private void handle(Record record) {
        // expensive processing
    }
}
```

## Explanation

### Issue 1: Unsynchronized Iterator Shared Across Threads

**Problem:** The main loop calls `it.hasNext()` and `it.next()` from a single thread, but `java.util.Iterator` implementations (including the one returned by `ArrayList`) are not thread-safe. Because the iterator's internal cursor is read and written without any lock, two concurrent calls — even from the same thread interleaved with tasks that might touch it, or in future refactors — can corrupt its state. In practice the observable symptoms are records processed twice, records silently skipped, and occasional `NoSuchElementException` when `next()` is called after another caller already advanced past the last element.

**Fix:** Wrap the `hasNext()` + `next()` pair inside a `synchronized (it)` block as shown at `CHANGE 1`. The loop changes from `while (it.hasNext()) { Record r = it.next(); ... }` to a `while (true)` loop that enters the monitor, checks `hasNext()`, calls `next()`, then exits the monitor before submitting the task.

**Explanation:** `ArrayList`'s iterator stores a simple `int cursor` field with no volatile or atomic guarantees. When thread A reads `cursor` for `hasNext()` and thread B concurrently increments it via `next()`, thread A sees a stale value and either skips an element or steps on the same index. Keeping `hasNext()` and `next()` inside the same `synchronized` block is necessary because checking and advancing must be atomic — a lock on `hasNext()` alone does not prevent another thread from racing in and calling `next()` before the first thread does. The `handle(record)` call is deliberately placed outside the lock so threads can process records in parallel rather than serializing all work through the monitor.

---

### Issue 2: hasNext()/next() Not Treated as an Atomic Check-Then-Act

**Problem:** Even if each individual iterator method were somehow safe to call concurrently, calling `hasNext()` and `next()` as two separate operations without holding a lock between them creates a check-then-act race. Between the moment `hasNext()` returns `true` and the moment `next()` executes, another thread could advance the iterator to the last position, making `next()` throw `NoSuchElementException`.

**Fix:** The `synchronized (it)` block at `CHANGE 1` covers both `if (!it.hasNext()) break;` and `record = it.next();` as a single atomic unit, eliminating the window between check and act.

**Explanation:** This is the compound-action problem: two individually safe operations are not safe when composed without a lock. Thread A calls `hasNext()` and gets `true` because one element remains. Before A calls `next()`, thread B (if iteration were multi-threaded) or any future refactor that moves iteration into worker threads could consume that last element. Thread A's subsequent `next()` then has nothing to return and throws. Putting both calls inside the same `synchronized` block means no other caller can observe or modify the iterator's state between the check and the advance.
