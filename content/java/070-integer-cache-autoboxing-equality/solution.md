## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Autoboxed Integer Equality Fails
// ------------------------------------------------------------------------

public class InventoryAlertService {

    private final ProductRepository productRepository;
    private final AlertSender alertSender;

    public InventoryAlertService(ProductRepository productRepository,
                                  AlertSender alertSender) {
        this.productRepository = productRepository;
        this.alertSender = alertSender;
    }

    public void checkAlerts() {
        for (Product product : productRepository.findAll()) {
            Integer currentStock = product.getStockCount();
            Integer alertThreshold = product.getAlertThreshold();

            // CHANGE 2: Guard against null values from JPA before comparing, to avoid NullPointerException on unboxing or .equals().
            if (currentStock == null || alertThreshold == null) {
                continue;
            }

            // CHANGE 1: Replace == with .equals() so value equality is used instead of reference equality; == only works reliably for Integer values in [-128, 127] due to JVM Integer cache.
            if (currentStock.equals(alertThreshold)) {
                alertSender.send(product.getId(), currentStock);
            }
        }
    }

    interface Product {
        long getId();
        Integer getStockCount();
        Integer getAlertThreshold();
    }
    interface ProductRepository {
        Iterable<Product> findAll();
    }
    interface AlertSender {
        void send(long productId, int stockCount);
    }
}
```

## Explanation

### Issue 1: Reference Equality on Boxed Integers

**Problem:** Alerts never fire when thresholds are set to values like 200 or 500, even though `currentStock` numerically equals `alertThreshold`. No exception is thrown; the `if` block is simply never entered.

**Fix:** Replace `currentStock == alertThreshold` with `currentStock.equals(alertThreshold)` at the `CHANGE 1` site. This compares the numeric values of the two `Integer` objects instead of their heap addresses.

**Explanation:** In Java, `==` on object references checks whether both variables point to the exact same object in memory, not whether the wrapped values are equal. The JVM maintains a shared cache of `Integer` instances for values from -128 to 127, so `Integer.valueOf(5) == Integer.valueOf(5)` happens to be `true` — both calls return the same cached object. Outside that range, each call to `Integer.valueOf(200)` (or each unbox-and-rebox through JPA) allocates a new heap object, so `==` returns `false` even when both hold 200. Using `.equals()` delegates to `Integer`'s value comparison, which always checks the `int` payload regardless of cache status. A related pitfall: code that worked in unit tests with small hard-coded values can mask this bug entirely, because test values often fall within [-128, 127].

---

### Issue 2: Missing Null Check Before Comparison

**Problem:** If JPA returns a `null` from `getStockCount()` or `getAlertThreshold()` (e.g., the column has no value set for a product), calling `.equals()` on the null reference throws a `NullPointerException`. Depending on how `@Scheduled` handles unchecked exceptions, this can silently abort the entire alert-check run for all remaining products in that batch.

**Fix:** Add a null guard at the `CHANGE 2` site: if either `currentStock` or `alertThreshold` is `null`, `continue` to the next product before reaching the `.equals()` call.

**Explanation:** `Integer` is a reference type, so any `Integer` variable can hold `null`. JPA maps a SQL `NULL` column directly to a Java `null` reference — there is no implicit zero substitution. Calling `null.equals(anything)` immediately throws `NullPointerException`. The null check with `continue` skips products where threshold or stock data is incomplete, which is the correct business behavior (a product with no configured threshold should not trigger an alert). If unboxing to `int` were used instead of `.equals()`, the same null would cause a `NullPointerException` at the unbox step, so the guard is necessary regardless of the comparison strategy chosen.
