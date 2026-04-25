## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — TreeSet Comparator Swallows Duplicates
// ------------------------------------------------------------------------

import java.util.Comparator;
import java.util.Collections;
import java.util.TreeSet;

public class ProductIndex {
    // CHANGE 1: Comparator now breaks price ties with product ID so two products at the same price are never considered equal by the TreeSet.
    private final TreeSet<Product> index = new TreeSet<>(
        Comparator.comparingDouble(Product::getPrice)
                  .thenComparingInt(Product::getId)
    );

    public void add(Product p) {
        index.add(p);
    }

    public int size() {
        return index.size();
    }

    // CHANGE 2: Return an unmodifiable view instead of the raw TreeSet so callers cannot bypass add() and corrupt internal state.
    public TreeSet<Product> getIndex() {
        return (TreeSet<Product>) Collections.unmodifiableSortedSet(index);
    }
}
```

## Explanation

### Issue 1: Comparator Collapses Same-Price Products

**Problem:** When two distinct `Product` objects share the same price, the `Comparator` returns 0. `TreeSet` uses its comparator — not `equals()` — to decide whether an element already exists. A return value of 0 means "same element", so the second product is silently dropped on `add()`. Operators see fewer products in the index than in the database, and the gap widens as more same-priced items are added.

**Fix:** Chain `.thenComparingInt(Product::getId)` after `comparingDouble(Product::getPrice)` so the comparator only returns 0 when both price and ID match, which should never happen for distinct products.

**Explanation:** `TreeSet` is a `NavigableSet` backed by a `TreeMap`, and it relies entirely on the comparator (or natural ordering) to determine element identity — it never calls `hashCode()` or `equals()`. When `comparator.compare(a, b)` returns 0, the tree treats `b` as a duplicate of the existing entry `a` and leaves the set unchanged. Adding a secondary sort key that is unique per product (here, `getId()`) means two products can share a price and still be ordered differently, so `compare` returns a non-zero value and both products are stored. A related pitfall: if `getId()` can also collide (e.g., IDs are reused across catalogs), you would need a further tiebreaker such as a UUID field.

---

### Issue 2: getIndex() Leaks Mutable Internal State

**Problem:** `getIndex()` hands the caller a direct reference to the internal `TreeSet`. Any caller can call `index.add()`, `index.remove()`, or `index.clear()` on the returned set and bypass the `ProductIndex` class entirely, making it impossible to enforce invariants or add validation logic to `add()` later.

**Fix:** Wrap the return value with `Collections.unmodifiableSortedSet(index)` and cast to `TreeSet<Product>` so the public API type is preserved but mutation is blocked at runtime.

**Explanation:** `Collections.unmodifiableSortedSet` returns a view that throws `UnsupportedOperationException` on any write operation, while still delegating all reads to the underlying set. The cast to `TreeSet<Product>` is safe here because the unmodifiable wrapper implements `SortedSet`, and `TreeSet` is the concrete `SortedSet` type expected by callers. If you prefer a stricter approach, changing the return type to `SortedSet<Product>` or `NavigableSet<Product>` would communicate the read-only intent through the type system without a cast.
