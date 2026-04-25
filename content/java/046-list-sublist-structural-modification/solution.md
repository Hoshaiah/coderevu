## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Sublist Invalidated by Parent Modification
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.List;

public class ChunkProcessor {
    private static final int CHUNK_SIZE = 500;
    private final List<String> records = new ArrayList<>();

    public void addRecord(String r) { records.add(r); }

    public void processAll() {
        // CHANGE 1+2: Copy records into a local snapshot list before chunking so that removeIf on the backing list cannot invalidate any subList view and cannot shift the indices we iterate over.
        List<String> snapshot = new ArrayList<>(records);
        int total = snapshot.size();
        for (int i = 0; i < total; i += CHUNK_SIZE) {
            int end = Math.min(i + CHUNK_SIZE, total);
            // CHANGE 1: Derive subList from the stable snapshot, not from records, so structural modifications to records never touch this view.
            List<String> chunk = snapshot.subList(i, end);
            processChunk(chunk);
        }
        // CHANGE 1+2: Perform the single removeIf call once, after all chunks have been processed, so no subList is live when the backing list is modified and indices are never disturbed mid-loop.
        records.removeIf(r -> r.startsWith("ERROR:"));
    }

    private void processChunk(List<String> chunk) {
        for (String r : chunk) {
            System.out.println("Processing: " + r);
        }
    }
}
```

## Explanation

### Issue 1: subList Invalidated by Structural Modification

**Problem:** The batch job throws `ConcurrentModificationException` even though only one thread is running. The exception originates inside `processChunk` while iterating the `chunk` list, but the actual cause is `records.removeIf()` executing in the same loop iteration, immediately after `processChunk` returns, before the next chunk is fetched.

**Fix:** The `snapshot` copy is introduced so that `subList` is called on `snapshot`, not on `records`. The `records.removeIf()` call is moved outside the loop entirely, running once after all chunks are processed.

**Explanation:** `List.subList()` returns a live view backed by the original list — it holds a reference to the parent's internal modCount. When `records.removeIf()` runs, it increments that modCount. On the very next iteration, when the loop creates a new `subList` and immediately calls `processChunk`, the for-each loop inside `processChunk` creates an iterator that captures the current modCount. If any chunk from a previous iteration is somehow still reachable (or if the JVM checks modCount eagerly on iterator construction), the mismatch triggers `ConcurrentModificationException`. Even without that, calling `removeIf` on the parent list while a prior `subList` reference exists is explicitly documented as invalidating all existing subList views. Moving `removeIf` to after the loop, and iterating over a snapshot, means the backing list of every `subList` is never structurally modified while that view is live.

---

### Issue 2: Stale Index and Total After Mid-Loop Removal

**Problem:** Even if the exception were suppressed, removing elements from `records` inside the loop corrupts iteration. `total` is captured once before the loop, and `i` advances by `CHUNK_SIZE` each iteration. After `removeIf` removes N elements, the list shrinks, so later windows `[i, i+CHUNK_SIZE)` silently skip records that shifted into already-processed index ranges.

**Fix:** The loop now iterates over `snapshot`, whose size never changes. `records.removeIf()` runs once after the loop completes, so `total` and `i` stay consistent with the list being iterated throughout.

**Explanation:** Imagine records at indices 0–999 and `CHUNK_SIZE=500`. After processing chunk `[0,500)`, `removeIf` deletes 10 ERROR records from `records`, shifting all remaining elements down by 10. The next window `[500,1000)` now addresses the wrong elements in `records` — 10 records that should have been in the second chunk are never seen. With a snapshot, the data being iterated is frozen at the moment `processAll` begins, so index arithmetic stays correct for the full pass. The deferred single `removeIf` still cleans up `records` correctly after all processing is done.
