## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — ArrayDeque Silently Rejects Null Elements
// ------------------------------------------------------------------------

import java.util.Queue;
import java.util.concurrent.LinkedBlockingQueue;

public class TaskQueue {
    // CHANGE 1: Replace ArrayDeque with LinkedBlockingQueue, which explicitly permits null-sentinel handling via a typed wrapper and is thread-safe; see CHANGE 2 for null handling.
    private static final String NULL_SENTINEL = "__NULL_SENTINEL__";

    // CHANGE 2: LinkedBlockingQueue is used instead of ArrayDeque — it allows safe concurrent access (fixing issue 2) and we encode null as a sentinel string so the queue contract is preserved (fixing issue 1).
    private final Queue<String> queue = new LinkedBlockingQueue<>();

    public boolean submit(String payload) {
        // CHANGE 1: Encode null payload as sentinel before enqueuing, so ArrayDeque's null rejection (now LinkedBlockingQueue's null rejection) never silently drops the heartbeat task.
        String toEnqueue = (payload == null) ? NULL_SENTINEL : payload;
        return queue.offer(toEnqueue);
    }

    public String take() {
        // CHANGE 1: Decode sentinel back to null on the consumer side so callers see the original null heartbeat payload.
        String value = queue.poll();
        if (NULL_SENTINEL.equals(value)) {
            return null;
        }
        return value;
    }

    public int size() {
        return queue.size();
    }
}
```

## Explanation

### Issue 1: Null Payload Silently Dropped by ArrayDeque

**Problem:** When a null payload is submitted, `ArrayDeque.offer(null)` throws a `NullPointerException` in some JDK versions and silently drops the element in others, because `ArrayDeque` explicitly forbids null elements. The HTTP handler catches or swallows the exception and returns 200 OK, but the task never reaches the worker.

**Fix:** At the `submit` method, a null payload is encoded as the constant `NULL_SENTINEL` string before calling `offer`. In `take`, the sentinel is decoded back to null before returning to the caller. This ensures null heartbeat tasks round-trip through the queue intact.

**Explanation:** `ArrayDeque` uses null as an internal tombstone value to mark empty slots in its circular buffer, so it rejects null entries at the API level. When `offer(null)` is called, the element is never added to the backing array, so `poll()` on the worker side never sees it. Encoding null as a sentinel string sidesteps this restriction entirely. The sentinel string should be a value that can never appear as a legitimate payload; if real payloads could collide with the sentinel, a wrapper object (`Optional<String>` or a small `Task` record) is a safer alternative. Switching to `LinkedBlockingQueue` (CHANGE 2) also forbids raw null, so the sentinel pattern is still required.

---

### Issue 2: Unsynchronized Queue Access from Multiple Threads

**Problem:** `ArrayDeque` is not thread-safe. The HTTP handler calls `offer` on one thread while the worker calls `poll` on another. Under concurrent access, the internal array can be read and written simultaneously, producing lost updates, duplicate reads, or an `ArrayIndexOutOfBoundsException`.

**Fix:** Replace `ArrayDeque` with `LinkedBlockingQueue`. The declaration changes from `Queue<String> queue = new ArrayDeque<>()` to `Queue<String> queue = new LinkedBlockingQueue<>()`. `LinkedBlockingQueue` uses internal locks on the head and tail independently, making `offer` and `poll` safe to call from different threads without external synchronization.

**Explanation:** `ArrayDeque` has no internal locking. When two threads resize or traverse the backing array at the same time, one thread can observe a partially updated index, leading to elements being skipped or read twice. `LinkedBlockingQueue` solves this with a two-lock algorithm: one lock guards the tail (for producers) and a separate lock guards the head (for consumers), so a producer and consumer can run truly in parallel without blocking each other unnecessarily. A `ConcurrentLinkedQueue` would also work for non-blocking use, but `LinkedBlockingQueue` is idiomatic for producer-consumer pipelines and its `take()` method (not used here but available) can block the worker until work arrives, avoiding a busy-wait poll loop.
