## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Nil Coalescing Hides Missing Optional
// ------------------------------------------------------------------------

struct CartItem {
    let name: String
    let basePrice: Double
    var discountedPrice: Double?
}

class CartViewModel: ObservableObject {
    @Published var items: [CartItem] = []

    var total: Double {
        items.reduce(0.0) { sum, item in
            sum + (item.discountedPrice ?? item.basePrice)
        }
    }

    var itemCount: Int { items.count }

    func applyDiscount(to index: Int, discountedPrice: Double) {
        guard items.indices.contains(index) else { return }
        items[index].discountedPrice = discountedPrice
    }

    func removeDiscount(from index: Int) {
        guard items.indices.contains(index) else { return }
        // CHANGE 1: Assign nil directly instead of `discountedPrice ?? nil`; the old expression returned the existing non-nil value unchanged, so the discount was never cleared.
        // CHANGE 2: Explicit `nil` literal assignment makes the intent unambiguous and cannot silently become a no-op the way nil-coalescing can.
        items[index].discountedPrice = nil
    }
}
```

## Explanation

### Issue 1: `?? nil` Preserves Existing Discount Forever

**Problem:** After a promo code is removed, the cart still shows the discounted total. Calling `removeDiscount(from:)` has no visible effect because the property value is never actually cleared.

**Fix:** Replace `items[index].discountedPrice = items[index].discountedPrice ?? nil` with `items[index].discountedPrice = nil` at the CHANGE 1 site.

**Explanation:** The `??` operator returns its left-hand operand when that operand is non-nil. So when `discountedPrice` holds a value like `8.99`, the expression `discountedPrice ?? nil` evaluates to `8.99` — the same value — and the assignment writes it straight back. The property never changes. The discount persists across sessions until the app is restarted or the item is removed. Assigning `nil` directly is the only way to clear an optional property; there is no shorthand that does it indirectly.

---

### Issue 2: Compiler Silently Accepts a No-Op Assignment

**Problem:** The line `items[index].discountedPrice = items[index].discountedPrice ?? nil` compiles without a warning. Swift's type checker sees a valid assignment of `Double?` to `Double?`, so the bug is invisible at build time and only surfaces at runtime when discounts refuse to clear.

**Fix:** At the CHANGE 2 site, using the literal `nil` on the right-hand side makes the assignment self-documenting and structurally impossible to misread — there is nothing for `??` to short-circuit.

**Explanation:** `?? nil` is a degenerate use of nil-coalescing: the fallback is the same "empty" value the operator is designed to avoid, so its only effect is to block a nil assignment when the left side is non-nil. Swift could in principle warn about `x ?? nil` but currently does not. Any engineer reading the original line might assume it "safely" resets the value, because `?? nil` looks like it means "or nothing" — which is the opposite of what it actually does. Using a plain `nil` literal removes the ambiguity entirely and signals the intent clearly to both the compiler and the next reader.
