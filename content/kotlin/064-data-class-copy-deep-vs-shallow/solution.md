## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Data Class copy Shares Mutable State
// ------------------------------------------------------------------------

data class CartItem(val productId: String, val quantity: Int) // CHANGE 2: quantity changed from var to val so CartItem is fully immutable; post-checkout quantity updates cannot mutate order line items

data class Cart(val items: MutableList<CartItem>)

data class Order(val id: String, val items: List<CartItem>) // CHANGE 1: items type changed from MutableList to List to make the order's item collection read-only at the type level

class CartService {
    private val cart = Cart(mutableListOf())

    fun addItem(productId: String, quantity: Int) {
        cart.items.add(CartItem(productId, quantity))
    }

    fun checkout(orderId: String): Order {
        // CHANGE 1: map { it.copy() } creates a deep copy — each CartItem is copied into a new independent list so future cart mutations do not affect the order snapshot
        val order = Order(orderId, cart.items.map { it.copy() })
        persistOrder(order)
        return order
    }

    fun updateItemQuantity(productId: String, newQuantity: Int) {
        // CHANGE 2: because CartItem is now immutable, updating quantity requires replacing the item in the list rather than mutating it in place
        val index = cart.items.indexOfFirst { it.productId == productId }
        if (index != -1) {
            cart.items[index] = cart.items[index].copy(quantity = newQuantity)
        }
    }

    private fun persistOrder(order: Order) {
        println("Persisting order: $order")
    }
}
```

## Explanation

### Issue 1: Shallow Reference Passed to Order

**Problem:** After a user checks out, adding or removing items from their cart also changes the items visible in the saved order. Users see order histories that reflect cart state from minutes after the purchase, not the state at checkout time.

**Fix:** In `checkout()`, replace `cart.items` with `cart.items.map { it.copy() }`, which allocates a new list containing independent copies of each `CartItem`. The `Order` type is also changed from `MutableList<CartItem>` to `List<CartItem>` to prevent callers from mutating the order's items directly.

**Explanation:** Kotlin's `data class copy()` on `Cart` produces a shallow copy: the new `Cart` object holds a reference to the *same* `MutableList` instance. Passing `cart.items` directly to `Order` hands that same live list to the order. Any call to `cart.items.add()` or `cart.items.remove()` afterwards modifies the list that the order already holds. `map { it.copy() }` creates a brand-new list with brand-new `CartItem` objects, so the cart and the order no longer share any mutable state. Changing `Order.items` to `List<CartItem>` adds a compile-time guardrail: code that tries to call `.add()` or `.remove()` on an order's item list will not compile.

---

### Issue 2: Mutable Field on CartItem Allows Post-Checkout Corruption

**Problem:** Even after fixing the list copy, `updateItemQuantity()` finds a `CartItem` by reference and writes to its `quantity` field. If an order's list happened to contain the same `CartItem` object (or if a future refactor re-introduces shared references), the quantity shown in the order silently changes to whatever the cart was updated to.

**Fix:** Change `quantity` in `CartItem` from `var` to `val`, making every `CartItem` instance immutable. Update `updateItemQuantity()` to replace the element in the list using `copy(quantity = newQuantity)` instead of mutating it in place.

**Explanation:** A `var` field means any code that holds a reference to a `CartItem` can change its `quantity` at any time. If the same object appears in both the cart list and an order list (which can happen with shallow copies or direct assignment), a quantity update targeting the cart also rewrites the order. Making `quantity` a `val` means the only way to change a `CartItem`'s quantity is to create a new object via `copy()`. `updateItemQuantity()` now calls `copy(quantity = newQuantity)` and replaces the element at that index in the cart list, leaving any previously created order snapshots completely untouched because those snapshots hold distinct object instances.
