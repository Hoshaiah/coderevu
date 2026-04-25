## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Sorting Unmodifiable List Throws
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class ProductCatalogService {
    private final ProductRepository repository;

    public ProductCatalogService(ProductRepository repository) {
        this.repository = repository;
    }

    public List<Product> getProductsSortedByPrice() {
        // CHANGE 1: Copy into a new ArrayList before sorting so Collections.sort can call List.set() without hitting the unmodifiable wrapper.
        List<Product> products = new ArrayList<>(repository.findAll());
        // CHANGE 2: Sort the mutable copy; this now succeeds because ArrayList.set() is supported.
        Collections.sort(products, Comparator.comparingDouble(Product::getPrice));
        return products;
    }
}
```

## Explanation

### Issue 1: Sorting unmodifiable list throws at runtime

**Problem:** Every call to `getProductsSortedByPrice()` throws `UnsupportedOperationException` with the stack trace pointing to `Collections.sort`. The endpoint is completely broken in production.

**Fix:** Replace `List<Product> products = repository.findAll()` with `List<Product> products = new ArrayList<>(repository.findAll())` so the local variable holds a fresh, mutable `ArrayList` instead of the unmodifiable wrapper.

**Explanation:** `Collections.sort` rearranges elements by calling `list.set(index, element)` on the list you pass in. `Collections.unmodifiableList` wraps the original list and overrides every mutating method — `set`, `add`, `remove`, etc. — to throw `UnsupportedOperationException`. The Javadoc signature `sort(List<T> list, ...)` accepts any `List`, but the implementation assumes the list is mutable; there is no compile-time enforcement of that assumption. Copying into `new ArrayList<>(...)` creates an independent mutable list backed by a plain array, so `set()` works normally. The original cached list in the repository is untouched, which preserves the caching layer's intent.

---

### Issue 2: Returning a mutable copy instead of the unmodifiable reference

**Problem:** Before the fix, the method returned the unmodifiable list directly. While this did not cause the immediate crash (that was Issue 1), it means any caller that tries to modify the returned list — adding a promoted product, filtering, etc. — will also throw `UnsupportedOperationException` at runtime with no warning at compile time.

**Fix:** Because CHANGE 1 already stores results in `new ArrayList<>(...)`, the method now returns that mutable copy. No additional line is needed; the return statement `return products` now returns the `ArrayList` rather than the unmodifiable wrapper.

**Explanation:** The repository intentionally returns an unmodifiable list to protect cached data. If the service had forwarded that same reference to the controller, the controller (or any downstream code) would be silently constrained by the same restriction. Returning a copy decouples the service's output contract from the repository's internal caching contract. A related pitfall: if you later switch to `products.stream().sorted(...).collect(Collectors.toList())` as an alternative fix, `Collectors.toList()` does return a mutable list today, but its mutability is explicitly not guaranteed by the spec — `Collectors.toUnmodifiableList()` makes the intent clear either way.
