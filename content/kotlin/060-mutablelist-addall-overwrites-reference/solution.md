## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — addAll Accumulates Into Wrong List
// ------------------------------------------------------------------------

class BatchAggregator(private val api: RecordApi) {

    fun aggregate(pageCount: Int): List<Record> {
        val result = mutableListOf<Record>()
        for (page in 1..pageCount) {
            val pageRecords = api.fetchPage(page)
            // CHANGE 1: removed `result = pageRecords.toMutableList()` which was overwriting the accumulated list on every iteration; now we keep the single `result` list declared above the loop.
            // CHANGE 2: addAll now appends pageRecords into the persistent `result` list instead of adding them a second time into a freshly-replaced list.
            result.addAll(pageRecords)
        }
        return result
    }
}
```

## Explanation

### Issue 1: List reassigned on every iteration

**Problem:** On every loop iteration the code runs `result = pageRecords.toMutableList()`, which throws away the list that was being built and replaces it with a brand-new list containing only the current page. After the loop finishes, `result` holds only the last page's records. All earlier pages are silently lost.

**Fix:** Remove the `result = pageRecords.toMutableList()` assignment entirely. The single `val result = mutableListOf<Record>()` declared before the loop is kept alive for all iterations, and `addAll` appends into it each time.

**Explanation:** A `var` binding lets the variable point to a different object on each assignment. When the code writes `result = pageRecords.toMutableList()`, it makes `result` point to a new list rather than the one created before the loop. The `addAll` call that follows then adds records into this new list, which is correct for that one page — but the next iteration replaces `result` again, discarding that work too. Changing `var result` to `val result` and removing the reassignment ensures there is exactly one list for the entire loop. A related pitfall: if you had kept `var` but only removed the reassignment line, the code would also be correct — the `val` change enforces the intent at the language level.

---

### Issue 2: Each page's records added twice

**Problem:** Even if the reassignment bug were the only problem, the original code also called `result.addAll(pageRecords)` right after `result = pageRecords.toMutableList()`. Because `toMutableList()` already copies all items from `pageRecords` into the new list, `addAll` then appends those same items a second time. Every page would appear twice in the final output.

**Fix:** Remove `result = pageRecords.toMutableList()` (CHANGE 1) so that `result.addAll(pageRecords)` (CHANGE 2) is the sole mechanism for adding records, appending each page's items exactly once into the shared list.

**Explanation:** `toMutableList()` is a copy constructor — it produces a new `MutableList` pre-populated with every element of the receiver. Calling `addAll(pageRecords)` on that list then inserts those elements a second time. The two lines together were intended to be alternatives (one to initialize, one to accumulate), but both were left in, causing duplication. With only `addAll` remaining and the list initialized to empty before the loop, each record is inserted once per page, giving the correct combined output.
