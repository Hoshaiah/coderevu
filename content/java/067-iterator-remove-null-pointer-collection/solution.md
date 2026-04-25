## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — HashMap Values Iterator NPE
// ------------------------------------------------------------------------

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class StockManager {
    private final Map<String, Integer> stock = new HashMap<>();

    public void addStock(String sku, Integer quantity) {
        stock.put(sku, quantity);
    }

    public void pruneOutOfStock() {
        Iterator<Map.Entry<String, Integer>> it = stock.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, Integer> entry = it.next();
            // CHANGE 1: Guard against null value before unboxing; also prune null entries as they represent unknown/missing stock.
            // CHANGE 2: Use Integer.valueOf(0).equals(...) pattern via explicit null check so zero-quantity non-null entries are still removed.
            if (entry.getValue() == null || entry.getValue() == 0) {
                it.remove();
            }
        }
    }

    public int totalUnits() {
        // CHANGE 3: Filter out any null values before unboxing to prevent NPE in the stream pipeline.
        return stock.values().stream().filter(v -> v != null).mapToInt(Integer::intValue).sum();
    }
}
```

## Explanation

### Issue 1: Null value unboxing NPE in pruneOutOfStock

**Problem:** When a null `Integer` value is stored in the map and `pruneOutOfStock` runs, the expression `entry.getValue() == 0` causes Java to unbox the null `Integer` to a primitive `int`, throwing a `NullPointerException`. The nightly job crashes and no pruning happens for that run.

**Fix:** At the CHANGE 1 site, a null check `entry.getValue() == null` is added as the first condition in the `if` statement, short-circuiting before any unboxing attempt.

**Explanation:** Java's `==` operator between an `Integer` and an `int` literal triggers auto-unboxing of the `Integer`. If the `Integer` reference is null, the JVM throws `NullPointerException` at that point, not at a call site you would expect. The fix uses short-circuit evaluation: `||` means the right-hand side (`entry.getValue() == 0`) is only evaluated when the left side is false, i.e., when the value is not null, so unboxing is safe. A related pitfall is using `entry.getValue().equals(0)` without a null guard — that also throws NPE on null.

---

### Issue 2: Null entries silently survive pruning

**Problem:** Even if the NPE were somehow swallowed, a null-valued entry represents an item with no known stock and should be removed. The original code only checks `== 0`, so null entries stay in the map indefinitely, polluting the inventory data.

**Fix:** At the CHANGE 2 site, the condition is extended to `entry.getValue() == null || entry.getValue() == 0`, so both null and zero entries are removed by `it.remove()`.

**Explanation:** The business requirement in the context states the method should remove entries where quantity is zero *or* null. The original code only covered the zero case. Because `HashMap` permits null values, callers can store a null quantity via `addStock(sku, null)`. Without the explicit null branch, those entries accumulate. Removing them in the iterator is safe because `Iterator.remove()` is the documented, ConcurrentModificationException-safe way to delete during traversal.

---

### Issue 3: totalUnits NPE on surviving null values

**Problem:** If any null-valued entry remains in the map when `totalUnits()` is called — either because pruning has not run yet or because a null was added after the last prune — the stream's `mapToInt(Integer::intValue)` step unboxes null and throws `NullPointerException`, making the method unreliable.

**Fix:** At the CHANGE 3 site, a `.filter(v -> v != null)` step is inserted before `mapToInt`, so null values are excluded from the sum entirely.

**Explanation:** `Integer::intValue` is equivalent to calling `.intValue()` on each element, which throws NPE on a null reference. The stream API does not add any implicit null safety. Adding the filter makes `totalUnits` defensive regardless of map state, so callers get a correct non-negative total rather than a crash. A reasonable alternative is to use `.mapToInt(v -> v == null ? 0 : v)`, but the filter is cleaner because null quantities contribute nothing to a unit count anyway.
