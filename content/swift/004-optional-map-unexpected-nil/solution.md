## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Optional Map Silently Drops Value
// ------------------------------------------------------------------------

import Foundation

func formatPrice(_ price: Decimal?) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.locale = Locale.current

    // CHANGE 1: Use `if let` to unwrap the optional Decimal directly, avoiding Optional.map whose outer nil-propagation swallows a non-nil Decimal when the inner closure returns nil (e.g. for 0.0).
    guard let price = price else { return "N/A" }
    // CHANGE 2: Call formatter.string(from:) directly and provide an explicit non-nil fallback string so a nil result from NumberFormatter is visible and distinct from a missing price.
    return formatter.string(from: price as NSDecimalNumber) ?? "N/A"
}
```

## Explanation

### Issue 1: `Optional.map` Drops Non-nil Value

**Problem:** Products with a price of exactly `0.00` always show a blank or "N/A" label even though `product.price` is non-nil. Prices like `1.99` format correctly, so the bug is specific to values that cause `NumberFormatter.string(from:)` to return `nil`.

**Fix:** Replace the `.map { ... }.flatMap { $0 }` chain with a `guard let` unwrap at `CHANGE 1`. The `guard` exits early with `"N/A"` only when `price` itself is `nil`, so a `Decimal` value of `0.0` always reaches the formatter.

**Explanation:** `Optional.map` transforms a `.some(x)` into `.some(f(x))`, but if `f(x)` itself is `nil` (because `NumberFormatter.string(from:)` returned `nil`), the result is `.some(nil)` — an `Optional<Optional<String>>`. The subsequent `.flatMap { $0 }` then collapses that to `.none`, making the entire expression `nil` and triggering the `?? "N/A"` fallback. For `Decimal(0)` cast to `NSDecimalNumber`, `NumberFormatter` may return `nil` in certain locale or formatter-state conditions, so the chain silently discards a perfectly valid, non-nil price. Switching to `guard let` separates the two concerns: "is there a price at all" versus "did formatting succeed", making each failure visible.

---

### Issue 2: Silent `nil` from `NumberFormatter.string(from:)`

**Problem:** `NumberFormatter.string(from:)` returns an `Optional<String>` and can return `nil` when formatting fails. The original code propagated that `nil` up through `flatMap` invisibly, and the fix in `guard let` alone still leaves this case unhandled unless addressed directly.

**Fix:** At `CHANGE 2`, the call to `formatter.string(from: price as NSDecimalNumber)` is followed by `?? "N/A"` directly on the same line, so a `nil` result from the formatter produces a visible fallback string rather than being smuggled back into an outer optional chain.

**Explanation:** `NumberFormatter.string(from:)` is documented to return `nil` when the formatter cannot produce a string for the given number — for example with unusual locale data or a malformed formatter configuration. In the fixed code, this case now returns `"N/A"` explicitly at the point of failure, which is the same sentinel the caller uses for a missing price. If your product requirements need a different display (e.g. `"$0.00"` hardcoded for zero), you can add a special case before calling the formatter, but the key point is that the failure is now explicit rather than absorbed by a chain of `Optional` transformations.
