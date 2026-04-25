## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — SubList Clear Corrupts Parent List
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.List;

public class BatchProcessor {
    private final int batchSize;

    public BatchProcessor(int batchSize) {
        this.batchSize = batchSize;
    }

    public void process(List<WorkItem> items) {
        List<WorkItem> workList = new ArrayList<>(items);

        // CHANGE 1: Use an explicit offset index instead of clearing a subList view; clearing the subList view removes elements from the backing list starting at index 0, which corrupts the remaining work and eventually empties the whole list after the first chunk.
        int offset = 0;

        while (offset < workList.size()) {
            // CHANGE 1: Compute end relative to offset so each iteration covers the next unseen chunk rather than always starting at 0.
            int end = Math.min(offset + batchSize, workList.size());
            List<WorkItem> batch = workList.subList(offset, end);

            for (WorkItem item : batch) {
                doWork(item);
            }

            // CHANGE 1: Advance offset instead of calling batch.clear(), so already-processed items are logically skipped without mutating the backing list mid-loop.
            // CHANGE 2: Avoid holding and mutating the subList view after iteration; advancing offset instead of calling clear() eliminates the fragile subList-then-mutate pattern that can cause ConcurrentModificationException.
            offset = end;
        }
    }

    private void doWork(WorkItem item) {
        // simulate processing
    }

    interface WorkItem {}
}
```

## Explanation

### Issue 1: subList.clear() Empties Backing List

**Problem:** After the first batch is processed, `batch.clear()` removes those elements from the backing `ArrayList`. Because `subList` is a structural view, this shifts all remaining elements toward index 0. On the next loop iteration, `workList.subList(0, end)` starts at index 0 again and covers the same (now shifted) items — effectively reprocessing them. Depending on list length and `batchSize`, the loop can appear to complete but leave subsequent processing stages with an empty or wrong list.

**Fix:** Replace the `batch.clear()` call with an `int offset` variable that advances by `end - offset` (i.e., by `batchSize`) each iteration. The `subList` call becomes `workList.subList(offset, end)`, and `offset = end` replaces `batch.clear()`. The backing list is never mutated.

**Explanation:** `ArrayList.subList` returns a `SubList` object that holds a reference to the parent list plus a start and end index. Calling `clear()` on it delegates to `ArrayList.removeRange`, which physically removes those elements and decrements the parent's `modCount`. Every subsequent `subList(0, end)` call therefore looks at a shorter list that has already had its head cut off. The original author's single-chunk test passed because when there is only one chunk, `clear()` empties the whole list, the `while` condition becomes false, and the loop exits correctly — the bug only appears with two or more chunks. Using an offset index leaves the list intact and is O(1) bookkeeping instead of O(n) element shifting per batch.

---

### Issue 2: Mutating a subList View After Iteration Is Fragile

**Problem:** The code obtains a `subList` view, iterates it with a for-each loop, and then calls `clear()` on that same view. Even though the for-each finishes before `clear()` is called, holding a live subList reference and then performing a structural mutation through it is a pattern that breaks if the loop body or any surrounding code ever causes a modification to the parent list first — the next access to the subList would throw `ConcurrentModificationException`.

**Fix:** Remove the `batch.clear()` call entirely and replace it with `offset = end`. The `batch` variable is now only used for the read-only for-each loop, so the subList view is never mutated.

**Explanation:** `ArrayList.SubList` checks the parent's `modCount` on every structural operation. If anything modifies the parent between when the subList is created and when `clear()` is called, the `clear()` throws `ConcurrentModificationException`. In the current code that other modification doesn't happen, but the pattern invites it — for example, if `doWork` were ever changed to remove items from `workList` directly, the subsequent `clear()` would blow up. Advancing `offset` instead of clearing removes the dependency on the subList's continued validity and makes the intent ("skip past what we already processed") explicit in the data structure rather than hidden in a side effect of view mutation.
