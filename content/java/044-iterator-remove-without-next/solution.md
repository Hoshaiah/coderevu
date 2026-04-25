## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Iterator Remove Before Next Call
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

public class TaskQueue {
    private final List<Task> pending = new ArrayList<>();

    public List<Task> drainHighPriority() {
        List<Task> result = new ArrayList<>();
        Iterator<Task> it = pending.iterator();
        while (it.hasNext()) {
            Task t = it.next();
            if (t.isHighPriority()) {
                result.add(t);
                it.remove();
            } else if (t.isCancelled()) {
                // CHANGE 1: removed the duplicate it.remove() call; a single remove() per next() is all that is legal and all that is needed to delete the element.
                it.remove();
            }
        }
        return result;
    }
}
```

## Explanation

### Issue 1: Duplicate `it.remove()` Causes `IllegalStateException`

**Problem:** The `else if (t.isCancelled())` branch calls `it.remove()` twice in a row. Every time a cancelled task is encountered, the JVM throws `java.lang.IllegalStateException` on the second call. In production this happens intermittently because it only triggers when the queue contains a cancelled task.

**Fix:** Delete the second `it.remove()` call in the cancelled-task branch, leaving exactly one `it.remove()` after `it.next()` has been called. The line `// CHANGE 1` in the reference solution marks this removal.

**Explanation:** The `Iterator` contract (defined in `java.util.Iterator`) states that `remove()` may be called at most once per call to `next()`, and only after `next()` has been called. After the first `it.remove()`, the iterator's internal cursor is in a state where it has already removed the current element; calling `remove()` again without an intervening `next()` violates the contract and the implementation throws `IllegalStateException`. One `it.remove()` is sufficient to delete the element from the underlying `ArrayList` — calling it twice does not make the deletion "more certain". A related pitfall: if you ever need to remove an element that was processed across two branches of logic, the correct pattern is still a single `it.remove()` after the single preceding `it.next()`, never two removes in sequence.

---
