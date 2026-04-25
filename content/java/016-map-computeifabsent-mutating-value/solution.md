## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Returning a mutated result from computeIfAbsent causes entries to be lost under concurrent access
// ------------------------------------------------------------------------
import java.util.*;
import java.util.concurrent.*;

public class EventBatcher {

    // CHANGE 1: Use CopyOnWriteArrayList or, better, a thread-safe list type as the bucket value. We switch to ConcurrentLinkedQueue to allow safe concurrent adds without external locking.
    private final ConcurrentHashMap<String, Queue<Event>> buckets =
            new ConcurrentHashMap<>();

    public void addEvent(String topic, Event event) {
        // CHANGE 1: computeIfAbsent now creates a ConcurrentLinkedQueue, which is thread-safe for concurrent offer() calls, replacing the non-thread-safe ArrayList.
        buckets.computeIfAbsent(topic, k -> new ConcurrentLinkedQueue<>())
               .offer(event);
    }

    public Map<String, List<Event>> drainAll() {
        // CHANGE 2: Instead of copying then clearing (which drops events added in between), atomically remove each key with remove() so no events are lost.
        Map<String, List<Event>> snapshot = new HashMap<>();
        for (String topic : new ArrayList<>(buckets.keySet())) {
            // CHANGE 2: remove() atomically takes ownership of the bucket; any new event for this topic after remove() goes into a fresh bucket and is not lost.
            Queue<Event> queue = buckets.remove(topic);
            if (queue != null && !queue.isEmpty()) {
                snapshot.put(topic, new ArrayList<>(queue));
            }
        }
        return snapshot;
    }
}
```

## Explanation

### Issue 1: Non-thread-safe list used as shared bucket

**Problem:** Multiple threads calling `addEvent` for the same topic all get back the same `ArrayList` instance from `computeIfAbsent` and then call `add()` on it concurrently. `ArrayList.add()` is not thread-safe: two threads can see the same internal array slot, overwrite each other's event, or trigger a resize that leaves the list in an inconsistent state. The result is silently fewer events in the bucket than were added — no exception is thrown.

**Fix:** Replace `new ArrayList<>()` with `new ConcurrentLinkedQueue<>()` and change the bucket map type to `ConcurrentHashMap<String, Queue<Event>>`. The `offer()` call on `ConcurrentLinkedQueue` is thread-safe without any external locking.

**Explanation:** `computeIfAbsent` on a `ConcurrentHashMap` guarantees that only one `ArrayList` is created per key, but it does nothing to protect subsequent mutations of the returned value. Once two threads both receive the same `ArrayList` reference and call `add()` simultaneously, they race on the internal `size` field and `elementData` array. `ConcurrentLinkedQueue` uses a lock-free linked structure where each `offer()` is an independent atomic compare-and-swap on the tail pointer, so concurrent producers never interfere. A related pitfall: `Collections.synchronizedList(new ArrayList<>())` would also work but requires the caller to hold the list's monitor during iteration, making `drainAll()` more complex.

---

### Issue 2: TOCTOU race between snapshot copy and clear

**Problem:** `drainAll()` first copies the map into a `HashMap` snapshot, then calls `buckets.clear()`. Any event added by another thread after the `new HashMap<>(buckets)` line but before `buckets.clear()` is present in the live map at clear-time but absent from the snapshot. Those events are silently discarded — the thread that added them got no error, but the database never sees them.

**Fix:** Replace the copy-then-clear pattern with a per-key `buckets.remove(topic)` inside a loop over the current key set. `ConcurrentHashMap.remove(key)` atomically unlinks the bucket; any `addEvent` call that arrives after `remove()` for that topic creates a fresh bucket that is never cleared.

**Explanation:** `ConcurrentHashMap` does not provide an atomic "snapshot everything and wipe" operation. `new HashMap<>(buckets)` and `buckets.clear()` are two separate operations with no lock held between them. The per-key `remove()` approach narrows the race to a single key at a time: once `remove(topic)` returns a queue, that queue is no longer reachable from the map, so new events for the same topic land in a brand-new queue inserted by `computeIfAbsent`. The snapshot loop iterates over a copy of the key set taken at the start, so topics added mid-drain are simply left in the map for the next `drainAll()` call rather than being dropped.
