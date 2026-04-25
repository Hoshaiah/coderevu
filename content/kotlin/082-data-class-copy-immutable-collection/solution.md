## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Data Class Copy Shares Mutable List
// ------------------------------------------------------------------------

data class CartItem(val productId: String, val quantity: Int)

// CHANGE 2: Use List (immutable interface) instead of MutableList so no caller can mutate items outside the store.
data class CartState(
    val items: List<CartItem>,
    val couponCode: String?,
    val totalCents: Int
)

class CartStore {
    private var currentState = CartState(
        items = listOf(),
        couponCode = null,
        totalCents = 0
    )
    private val history = mutableListOf<CartState>()

    fun addItem(item: CartItem) {
        val snapshot = currentState.copy()
        history.add(snapshot)
        // CHANGE 1: Build a new list instead of mutating the shared list; .copy() on a data class does a shallow copy, so the old MutableList reference was shared between snapshot and currentState.
        val newItems = currentState.items + item
        currentState = currentState.copy(
            items = newItems,
            totalCents = newItems.sumOf { it.quantity * 100 }
        )
    }

    fun undo(): CartState? {
        return history.removeLastOrNull()?.also { currentState = it }
    }
}
```

## Explanation

### Issue 1: `copy()` Shares Mutable List Reference

**Problem:** Calling `.copy()` on a Kotlin `data class` does a shallow copy — primitive and reference fields are copied by value, but object references are copied as-is. Because `items` is a `MutableList`, the snapshot stored in `history` and `currentState` end up pointing to the exact same list object. When `currentState.items.add(item)` runs, it mutates that shared list, so the snapshot already contains the new item before `undo()` is ever called. The QA team sees the "previous" state reflecting the very change they tried to undo.

**Fix:** Replace `currentState.items.add(item)` and the subsequent `copy(totalCents = …)` with a single `copy(items = currentState.items + item, totalCents = …)`. The `+` operator on `List` returns a new list, so `currentState` gets a fresh list while the snapshot in `history` keeps the original.

**Explanation:** Kotlin's `data class` `copy()` is intentionally shallow because deep-copying arbitrary object graphs would be expensive and often wrong. A `MutableList` is just a heap object; copying the reference means both the old and new state variable point at the same backing array. Every `add` or `remove` call goes through that shared reference and is visible from all holders. The fix avoids mutation altogether: `currentState.items + item` allocates a new `ArrayList`, so each `CartState` in `history` holds its own independent list. A related pitfall: if `CartItem` itself had mutable fields, you would also need to deep-copy each element; here `CartItem` is already a `data class` with only `val` fields, so a new list of the same `CartItem` references is safe.

---

### Issue 2: `MutableList` Field Breaks Immutability Contract

**Problem:** Even after fixing the mutation inside the store, any code that holds a `CartState` reference can call `state.items.add(…)` or `state.items.clear()` directly. This bypasses the store entirely, so `history` is never updated and state changes are invisible to the undo system or any analytics listener.

**Fix:** Change the `items` field type in `CartState` from `MutableList<CartItem>` to `List<CartItem>`, and update the initial value in `CartStore` from `mutableListOf()` to `listOf()`. The field type is now a read-only interface, so the compiler rejects any attempt to call mutating methods on `state.items` outside the store.

**Explanation:** `MutableList` and `List` in Kotlin are two interfaces on the same underlying `ArrayList` implementation. Declaring the field as `List` does not copy the data; it simply narrows what the type system allows you to do with it. Code outside the store sees only `get`, `size`, `iterator`, and similar read operations. Importantly, someone could still cast `state.items as MutableList` to work around this, but that requires deliberate effort and is obviously wrong in a code review. The practical benefit is that accidental mutations — a common source of subtle state bugs — are caught at compile time rather than appearing as intermittent runtime failures.
