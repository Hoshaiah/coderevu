## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Blocking I/O Inside Synchronized Method
// ------------------------------------------------------------------------

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class StockService {
    // CHANGE 2: Replaced HashMap with ConcurrentHashMap so that reads/writes outside the synchronized block are thread-safe without needing the intrinsic lock.
    private final Map<String, Integer> stock = new ConcurrentHashMap<>();
    private final EventBroker broker;

    public StockService(EventBroker broker) {
        this.broker = broker;
    }

    public void adjustStock(String sku, int delta) throws Exception {
        // CHANGE 1: Narrow the synchronized block to cover only the map mutation, then release the lock before calling broker.publish so that blocking I/O never holds the lock.
        String eventPayload;
        synchronized (this) {
            int current = stock.getOrDefault(sku, 0);
            int updated = current + delta;
            if (updated < 0) {
                throw new IllegalArgumentException("Stock cannot go negative for " + sku);
            }
            stock.put(sku, updated);
            eventPayload = sku + ":" + updated;
        }
        // Publish happens outside the synchronized block; broker latency no longer blocks other threads from acquiring the lock.
        broker.publish("stock.updated", eventPayload);
    }

    public synchronized int getStock(String sku) {
        return stock.getOrDefault(sku, 0);
    }

    interface EventBroker {
        void publish(String topic, String message) throws Exception;
    }
}
```

## Explanation

### Issue 1: Blocking I/O Inside Synchronized Lock

**Problem:** Every call to `adjustStock` holds the intrinsic lock on the `StockService` instance for the entire duration of `broker.publish`. When the broker takes even 200ms to respond, every other thread trying to call `adjustStock` or `getStock` queues up waiting for the lock. Under moderate concurrency this produces a full application stall visible in thread dumps as hundreds of threads in `BLOCKED` state.

**Fix:** The `synchronized` modifier is removed from the method signature. A `synchronized (this)` block is introduced that covers only the map read-check-write sequence. The broker call is moved outside and after that block, using a local variable `eventPayload` to carry the computed value across the boundary.

**Explanation:** Java's intrinsic lock is held from the moment a `synchronized` method is entered until it returns. `broker.publish` performs a network round-trip, so the lock is held for the full network latency. Any thread that needs the lock — even just to read stock via `getStock` — must wait. Narrowing the `synchronized` block to the map mutation means the lock is held for only a few microseconds of in-memory work. The broker call then runs outside the lock, so its latency affects only the calling thread. One pitfall: the `eventPayload` snapshot is taken while still inside the synchronized block, so the published value always matches what was committed to the map.

---

### Issue 2: Non-Thread-Safe Map After Lock Is Narrowed

**Problem:** The original code used `HashMap`, which is not thread-safe. While the original `synchronized` method happened to serialize all access, narrowing the lock in the fix means `getStock` (which keeps its own `synchronized` block) and `adjustStock`'s mutation block run under the same intrinsic lock and stay safe — but replacing the map type makes the safety guarantee explicit and resilient to future refactoring that might remove those locks.

**Fix:** `HashMap` is replaced with `ConcurrentHashMap` on the field declaration line.

**Explanation:** `HashMap`'s internal structure can be corrupted if two threads mutate it concurrently without synchronization, producing infinite loops or lost updates. After the lock is narrowed, all map access in this class still goes through synchronized blocks, so `HashMap` would technically remain safe here. However, `ConcurrentHashMap` documents the intent, tolerates future callers that might bypass the lock, and performs better under concurrent reads because it uses segment-level locking internally rather than blocking the entire map. It is a low-cost change that removes an entire category of potential bugs if the synchronization strategy evolves.
