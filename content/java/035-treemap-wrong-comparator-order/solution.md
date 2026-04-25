## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Reversed Comparator Loses Map Entries
// ------------------------------------------------------------------------

import java.util.Map;
import java.util.TreeMap;

public class TopScores {
    private final int maxSize;
    private final TreeMap<Integer, String> scores;

    public TopScores(int maxSize) {
        this.maxSize = maxSize;
        // CHANGE 1+2: Use Integer.compare with arguments reversed (b, a) for safe descending order; subtraction overflows and ascending order drops the wrong entry.
        this.scores = new TreeMap<>((a, b) -> Integer.compare(b, a));
    }

    public void addScore(int score, String playerName) {
        scores.put(score, playerName);
        if (scores.size() > maxSize) {
            // With descending order the lowest score is now last, so pollLastEntry prunes correctly.
            // CHANGE 2: pollLastEntry() removes the lowest score; the old pollFirstEntry() removed the highest.
            scores.pollLastEntry();
        }
    }

    public Map<Integer, String> getTopScores() {
        return scores;
    }
}
```

## Explanation

### Issue 1: Integer subtraction comparator overflows

**Problem:** The comparator `(a, b) -> a - b` is used to order scores. When `a` is a large positive integer and `b` is a large negative integer (or vice versa), the subtraction wraps around due to 32-bit integer overflow, returning a value with the wrong sign. This causes the `TreeMap` to place entries in the wrong positions, and because a `TreeMap` relies on consistent comparator results to maintain its internal red-black tree, misplaced nodes can become unreachable — entries effectively disappear from the map.

**Fix:** Replace `a - b` with `Integer.compare(b, a)` at the `CHANGE 1+2` site. `Integer.compare` avoids arithmetic entirely and returns a safe negative, zero, or positive value.

**Explanation:** `a - b` looks correct for small values, but integers in Java are 32-bit. If `a = Integer.MAX_VALUE` and `b = -1`, the subtraction `a - b` wraps to `Integer.MIN_VALUE`, which is negative — so the comparator claims `a < b` even though `a` is much larger. The `TreeMap` then stores the node on the wrong side of the tree. Later lookups that traverse the tree using the same comparator may never reach that node, making it appear absent. `Integer.compare(x, y)` returns `x - y` conceptually but is implemented with branches so overflow is impossible.

---

### Issue 2: Ascending order causes pruning to remove the highest score

**Problem:** Even ignoring overflow, `a - b` sorts scores in ascending order (smallest first). The pruning line calls `pollFirstEntry()`, which removes the entry with the smallest key — but in ascending order the smallest key is the lowest score. As a result, every time the map exceeds capacity, the best score is kept and the worst is evicted, which is correct only by accident for one direction. Actually the opposite: `pollFirstEntry` on an ascending map removes the lowest score, so high scores are retained. Wait — the real symptom is that the map is in ascending order when it should be descending, meaning the leaderboard is iterated lowest-first rather than highest-first, and `pollFirstEntry` removes the lowest score. That part accidentally works, but the iteration order exposed through `getTopScores()` is wrong, showing the worst player at the top.

**Fix:** Swap the comparator arguments to `Integer.compare(b, a)` so the map is in descending order, and change `pollFirstEntry()` to `pollLastEntry()` at the `CHANGE 2` site so the lowest score is still the one pruned when the map is over capacity.

**Explanation:** A leaderboard needs the highest score at the front of the map. With the original ascending comparator, iterating `scores` yields scores from worst to best. The pruning call `pollFirstEntry()` on an ascending map happens to remove the lowest score, which is the right entry to prune — so pruning works by accident. But once the comparator is corrected to descending order, `pollFirstEntry()` would remove the highest score, destroying the very entry the leaderboard is meant to preserve. Switching to `pollLastEntry()` removes the entry at the end of the descending map, which is the lowest score, restoring correct pruning behavior.
