## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — StateFlow Value Mutated In Place
// ------------------------------------------------------------------------

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class CartItem(val id: String, val name: String, val quantity: Int)

class CartViewModel {

    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart

    fun addItem(item: CartItem) {
        // CHANGE 1: Copy the current list into a new list before adding the item, so the new value has a different reference and StateFlow's equality check detects a change and emits.
        // CHANGE 2: Use `toMutableList()` instead of an unsafe cast to avoid a ClassCastException when the backing list is immutable (e.g., the initial `emptyList()`).
        val current = _cart.value.toMutableList()
        current.add(item)
        _cart.value = current
    }
}
```

## Explanation

### Issue 1: Same Reference Suppresses StateFlow Emission

**Problem:** When the user adds the first item, the UI does not recompose even though `emit` runs. Subsequent adds work because by then the list reference has diverged in some code paths. The first add is silently lost.

**Fix:** Replace `_cart.value as MutableList<CartItem>` with `_cart.value.toMutableList()` at the `// CHANGE 1` site. `toMutableList()` always produces a new `ArrayList` instance, so the value assigned to `_cart.value` is a distinct object.

**Explanation:** `MutableStateFlow` compares the incoming value to the current value using `equals` (which for lists delegates to element-by-element equality) and also short-circuits on referential equality (`===`). When you cast `_cart.value` to `MutableList` and mutate it in place, you are mutating the exact object that `_cart` is already holding. Assigning that same reference back means `_cart.value === current` is `true`, so `StateFlow` decides nothing changed and does not notify collectors. By calling `toMutableList()`, you get a fresh `ArrayList` populated with the same elements; after `add(item)` it also differs by content, so both the reference check and the equality check confirm a real change and the emission proceeds.

---

### Issue 2: Unsafe Cast to MutableList Can Throw at Runtime

**Problem:** `_cart.value as MutableList<CartItem>` compiles with an unchecked-cast warning, but `emptyList()` returns `Collections.emptyList()`, which is immutable. Calling `.add()` on it throws `UnsupportedOperationException` at runtime.

**Fix:** Replace the cast with `_cart.value.toMutableList()` at the `// CHANGE 2` site. `toMutableList()` is a stdlib extension that copies elements into a new `ArrayList`, regardless of whether the source is mutable or immutable.

**Explanation:** Kotlin's `emptyList()` returns a singleton immutable list from the Java standard library. Casting it to `MutableList` does not change its runtime type; the cast itself succeeds because of type erasure, but the first call to `.add()` on it throws `UnsupportedOperationException`. Any list returned from snapshot reads or other APIs may similarly be immutable. Using `toMutableList()` eliminates this assumption entirely — it always produces a writable `ArrayList`, so the subsequent `add(item)` call is safe regardless of where the source list came from.
