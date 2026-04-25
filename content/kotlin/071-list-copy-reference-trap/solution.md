## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Defensive Copy of Nested List
// ------------------------------------------------------------------------

// CHANGE 1: quantity is now val instead of var — CartItem fields must be immutable so shared references cannot mutate cart state after the cart is constructed.
data class CartItem(val productId: String, val quantity: Int, val price: Double)

class ShoppingCart(items: List<CartItem>) {
    // CHANGE 2: copy each CartItem into a new instance so no external reference to the original objects can affect the stored list, even if CartItem ever gains mutable state again.
    private val _items: List<CartItem> = items.map { it.copy() }

    val items: List<CartItem> get() = _items

    fun totalPrice(): Double = _items.sumOf { it.price * it.quantity }
}

// Caller code:
fun checkout(mutableItems: MutableList<CartItem>): ShoppingCart {
    val cart = ShoppingCart(mutableItems)
    mutableItems.add(CartItem("promo-99", 1, 0.0))  // added after cart creation — safe now because ShoppingCart copied elements before this line runs
    return cart
}
```

## Explanation

### Issue 1: Mutable `var` field on shared `CartItem`

**Problem:** `CartItem.quantity` is declared as `var`, so any code that holds a reference to a `CartItem` object can change `quantity` at any time. Because `toList()` only creates a new list wrapper — it does not clone the objects inside — the `CartItem` instances in `ShoppingCart._items` are the same objects the caller holds. If the caller later does `someItem.quantity = 99`, the quantity inside the already-constructed `ShoppingCart` changes silently, producing wrong totals.

**Fix:** Change `var quantity: Int` to `val quantity: Int` in `CartItem` (the `// CHANGE 1` site). This makes the field read-only at the language level, so no external code can reassign it after construction.

**Explanation:** Kotlin `data class` with `var` fields looks immutable but is not. The `toList()` call in the constructor copies the list spine (the references) but not the objects those references point to. Both the caller's list and `ShoppingCart._items` point to the exact same `CartItem` instances in memory. Making `quantity` a `val` removes the mutation path entirely. A related pitfall: if `CartItem` held a mutable collection as a property (e.g., a `MutableList` of selected options), making the field `val` would still not protect it — you would also need to copy that inner collection.

---

### Issue 2: Shallow element copy missing from defensive copy

**Problem:** Even with `val` fields enforced today, the pattern of calling only `toList()` in the constructor leaves the cart vulnerable to future regressions: the moment anyone adds a `var` field or a mutable property to `CartItem`, the defensive copy silently stops working. The QA-reported symptom — cart contents changing after a snapshot is taken — can recur without any warning.

**Fix:** Replace `items.toList()` with `items.map { it.copy() }` at the `// CHANGE 2` site. `data class` generates a `copy()` method that constructs a new `CartItem` with the same field values, so `_items` holds freshly allocated objects that share no identity with the caller's originals.

**Explanation:** `toList()` is a structural copy of the list but a shallow copy of its contents. `map { it.copy() }` performs a shallow copy of each element, which is sufficient here because all of `CartItem`'s fields are now primitives or immutable `String` values — there is nothing deeper to copy. If `CartItem` later gained a mutable property like a `MutableList<String>`, you would need a deep copy strategy for that property too; `copy()` alone would not be enough. The combination of `val` fields (Issue 1) and element-level copying (Issue 2) makes the defensive copy genuinely defensive rather than superficially so.
