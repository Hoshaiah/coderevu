## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Mutable List Leaked from Data Class
// ------------------------------------------------------------------------

data class CartItem(val sku: String, val quantity: Int)

data class ShoppingCart(
    val id: String,
    // CHANGE 1: Store items as an immutable List backed by a defensive copy so external code cannot cast it back to MutableList and mutate it directly.
    val items: List<CartItem> = emptyList()
) {
    fun addItem(item: CartItem): ShoppingCart {
        // CHANGE 1+2: Build a new plain List via `+` and wrap it in `toList()` to ensure the result is an unmodifiable snapshot — no unsafe cast needed.
        val updated = (items + item).toList()
        return copy(items = updated)
    }

    fun removeItem(sku: String): ShoppingCart {
        return copy(items = items.filter { it.sku != sku })
    }
}
```

## Explanation

### Issue 1: Mutable list leaked through `items` property

**Problem:** Callers can write `cart.items.add(item)` directly, bypassing `addItem` and the analytics events it fires. Items appear in the cart silently, with no analytics record.

**Fix:** Replace `(items + item) as MutableList<CartItem>` with `(items + item).toList()`. `toList()` returns a new `List` backed by a read-only `ArrayList` wrapper, so the `items` property always holds an unmodifiable snapshot.

**Explanation:** The `+` operator on a `List` returns an `ArrayList` internally. When the code then casts that result to `MutableList<CartItem>` and stores it in the `items` property, any holder of a `ShoppingCart` reference can call `(cart.items as MutableList).add(...)` without hitting `addItem`. Calling `.toList()` instead produces a list that throws `UnsupportedOperationException` on mutation attempts, so callers cannot bypass the intended API. A related pitfall: even without the explicit cast, if you returned the raw result of `items + item` (an `ArrayList`), Kotlin's type system would accept it as `List<CartItem>` but a caller who knows the runtime type could still cast it. `toList()` closes that gap by wrapping the data in a truly read-only view.

---

### Issue 2: Unsafe cast on runtime implementation detail

**Problem:** `(items + item) as MutableList<CartItem>` will throw `ClassCastException` at runtime if `items + item` ever returns a list type that is not a `MutableList`. This is an unchecked cast that the Kotlin compiler only warns about, not prevents.

**Fix:** Remove the `as MutableList<CartItem>` cast entirely and call `.toList()` on the concatenation result instead, as shown at the `CHANGE 1+2` site. The return type is `List<CartItem>`, which matches the `copy()` parameter without any casting.

**Explanation:** Kotlin's `+` operator for lists is an extension that returns `List<T>`, not `MutableList<T>`. The current runtime happens to back that return value with `ArrayList`, making the cast succeed today. But the contract is `List<T>`, so a future standard library change or a different `items` source (e.g., `Collections.unmodifiableList`) could return something that is not a `MutableList`, causing a runtime crash. Removing the cast and using `.toList()` makes the code depend only on the public contract of `List`, not on a runtime implementation detail.
