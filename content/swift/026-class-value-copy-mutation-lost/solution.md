## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Struct Mutation Lost After Copy
// ------------------------------------------------------------------------

import Foundation

struct CartItem {
    var productID: String
    var quantity: Int
    var price: Double
}

final class CartManager {
    private(set) var items: [CartItem] = []

    func addItem(_ item: CartItem) {
        items.append(item)
    }

    func updateQuantity(for productID: String, quantity: Int) {
        // CHANGE 1: Use `firstIndex(where:)` to get the position in the array so we can write back through the subscript, instead of `first(where:)` which returns a detached value copy that is thrown away after mutation.
        guard let index = items.firstIndex(where: { $0.productID == productID }) else {
            return
        }
        items[index].quantity = quantity // CHANGE 1: Mutate the element in-place via subscript so the change is persisted to the array.
        print("Updated quantity to \(items[index].quantity) for \(items[index].productID)")
    }

    func totalPrice() -> Double {
        items.reduce(0) { $0 + $1.price * Double($1.quantity) }
    }
}
```

## Explanation

### Issue 1: Struct Copy Mutation Discarded

**Problem:** Every time a customer changes an item quantity via the stepper, the cart silently ignores the change. When the order is placed, every item still has its original quantity. No error is raised because the code runs without fault — it just modifies a temporary value and throws it away.

**Fix:** Replace `items.first(where:)` with `items.firstIndex(where:)` to get the integer index of the matching element, then write the new quantity directly back into the array with `items[index].quantity = quantity`.

**Explanation:** `CartItem` is a `struct`, which means Swift always works with value semantics — assigning or returning a struct produces an independent copy. When you call `items.first(where:)`, Swift copies the matching `CartItem` out of the array and hands it to you as the local `var item`. Mutating `item.quantity` updates only that local copy; the element sitting inside `items` is untouched. The `print` statement then confirms the local copy looks right, which is exactly why the developer was confused — the data appears correct locally but the array is stale. Using `firstIndex` gives you the position of the element inside the array, and writing through `items[index].quantity` modifies the stored element directly rather than a detached copy. A related pitfall: if you ever switch `CartItem` to a `class`, `first(where:)` would work because you'd get a reference, not a copy — but that would introduce shared-mutable-state hazards elsewhere, so keeping it a struct and using the index approach is the right call here.

---
