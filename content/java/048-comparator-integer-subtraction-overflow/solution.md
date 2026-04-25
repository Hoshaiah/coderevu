## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Comparator Subtraction Integer Overflow
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class Leaderboard {

    public static class Player {
        final String name;
        final int score;
        Player(String name, int score) {
            this.name = name;
            this.score = score;
        }
    }

    private final List<Player> players = new ArrayList<>();

    public void addPlayer(Player p) {
        players.add(p);
    }

    // Sort descending: highest score first
    public List<Player> getRankings() {
        // CHANGE 1: Replace subtraction shortcut with Integer.compare to avoid signed integer overflow when scores span MIN_VALUE..MAX_VALUE; arguments are reversed (b then a) to keep descending order.
        players.sort((a, b) -> Integer.compare(b.score, a.score));
        // CHANGE 2: Sort a defensive copy so that the internal list order does not change out from under any caller who retained a reference from a previous getRankings() call.
        List<Player> result = new ArrayList<>(players);
        result.sort((a, b) -> Integer.compare(b.score, a.score));
        return result;
    }
}
```

## Explanation

### Issue 1: Subtraction comparator integer overflow

**Problem:** The leaderboard produces wrong rankings during tournament play. Players with very negative penalty scores appear at the top and high-scoring players sink to the middle. The bug only shows up when scores span a wide range (e.g., one player at `Integer.MAX_VALUE` and another at `Integer.MIN_VALUE`).

**Fix:** Replace `b.score - a.score` with `Integer.compare(b.score, a.score)` at the `CHANGE 1` site. `Integer.compare` returns a negative, zero, or positive `int` based on the correct mathematical relationship between the two values, without any arithmetic on the values themselves.

**Explanation:** Java `int` arithmetic wraps silently on overflow. When `b.score` is `2_000_000_000` and `a.score` is `-2_000_000_000`, the subtraction `b.score - a.score` should be a large positive number (indicating b > a), but the true result `4_000_000_000` exceeds `Integer.MAX_VALUE` and wraps to a negative value, making the comparator report that a > b — the opposite of reality. `Integer.compare(x, y)` is implemented as `(x < y) ? -1 : ((x == y) ? 0 : 1)`, which never performs subtraction and is always correct across the full `int` range. A related pitfall: the same overflow can happen with the arguments swapped (`a.score - b.score`), so neither order of the subtraction shortcut is safe when scores are unbounded.

---

### Issue 2: In-place sort mutates shared internal list

**Problem:** `players.sort(...)` sorts the `players` field in place before the defensive copy is made. If a caller holds a reference returned by a previous `getRankings()` call (which is an `ArrayList` copy taken after that earlier sort), subsequent calls to `getRankings()` re-sort `players` and the old copy is unaffected — but the internal list itself changes state on every call, which can surprise code that iterates `players` on another thread or relies on insertion order elsewhere in the class.

**Fix:** At the `CHANGE 2` site, create the `result` copy first (or sort only the copy) so the internal `players` list is never reordered. The reference solution builds `result` from `players` and sorts `result` with the corrected comparator, leaving `players` in its original insertion order.

**Explanation:** `ArrayList.sort` is an in-place operation — it rearranges the elements of the list it is called on. Calling it on `players` and then copying gives you a correctly sorted copy, but it permanently changes the order of `players` as a side effect. If insertion order matters for any other method (e.g., a future `getRecentlyAdded()` method), that order is silently destroyed. Sorting the copy instead of the source keeps `players` stable and makes `getRankings()` a pure read operation with no observable side-effect on the object's state.
