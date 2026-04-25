## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — hasNext Loop on Empty Iterator
// ------------------------------------------------------------------------

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.ArrayList;
import java.util.List;

public class ResultDrainer {
    private final BlockingQueue<String> queue;

    public ResultDrainer(BlockingQueue<String> queue) {
        this.queue = queue;
    }

    public List<String> drainAll() {
        List<String> results = new ArrayList<>();
        // CHANGE 1, 2, 3: Replace iterator-based loop with drainTo(), which atomically moves all current elements into results and removes them from the queue without throwing UnsupportedOperationException.
        queue.drainTo(results);
        return results;
    }
}
```

## Explanation

### Issue 1: `Iterator.remove()` throws `UnsupportedOperationException`

**Problem:** The buggy code calls `it.remove()` on the iterator returned by `LinkedBlockingQueue.iterator()`. At runtime this throws `UnsupportedOperationException` on every element, so no element is ever removed from the queue and the method effectively returns a snapshot while leaving the queue full.

**Fix:** Replace the entire iterator loop with a single call to `queue.drainTo(results)` (the `CHANGE 1` site). This removes the `it.remove()` call entirely.

**Explanation:** `LinkedBlockingQueue`'s iterator documents that `remove()` is not supported and will throw. The iterator was designed for inspection, not mutation. The method `drainTo(Collection)` is the correct API for removing all available elements from a `BlockingQueue` into another collection — it is defined on the `BlockingQueue` interface specifically for this pattern. Relying on iterator removal worked on `ArrayDeque` (which does support it) but the behaviour does not transfer when porting to `BlockingQueue` implementations.

---

### Issue 2: Iterator does not drain concurrently-added elements

**Problem:** The iterator is a snapshot-like cursor over elements present when it was created (or traversed). If a producer thread adds an element to the queue after the iterator is already past that position, `hasNext()` returns `false` before reaching it and the element is silently skipped. The caller believes it received everything, but the queue still holds items.

**Fix:** `queue.drainTo(results)` at the `CHANGE 2` site transfers all elements that are in the queue at the moment of the call in one operation, and any element added after that call stays in the queue for the next drain — a clearly defined boundary with no silent gaps.

**Explanation:** `drainTo` locks the queue internally, moves all available elements, and releases the lock. Any producer that tries to add during that window blocks until the drain finishes. After the call returns, `results` contains exactly what was in the queue and the queue is empty (of those elements). An iterator holds no such lock across its traversal, so concurrent inserts can slip in or out of visibility unpredictably.

---

### Issue 3: Iterator-based approach leaves queue populated

**Problem:** Even ignoring concurrency, the iterator loop was supposed to both read and remove every element. Because `remove()` throws, the queue is never emptied. Any downstream code or a second call to `drainAll()` sees the same elements again, causing duplicate processing.

**Fix:** `queue.drainTo(results)` at the `CHANGE 3` site guarantees removal as part of the transfer — there is no separate remove step that can fail independently.

**Explanation:** `drainTo` is specified to remove each transferred element from the source collection before adding it to the destination. The removal and the addition are not two separate calls; they happen together inside the queue's own lock. This means a partially-failed drain (e.g., the destination throws on `add`) will have removed exactly as many elements as were successfully added, leaving a consistent state. The iterator approach had no such guarantee even if `remove()` had been supported, because an exception between `it.next()` and `it.remove()` would leave an element consumed from the iterator but still sitting in the queue.
