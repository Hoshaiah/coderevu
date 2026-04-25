## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — fold Initial Value Wrong Type
// ------------------------------------------------------------------------

data class LineItem(val description: String, val amount: Double)

object InvoiceCalculator {

    fun totalAmount(items: List<LineItem>): Double {
        // CHANGE 1: Initial value changed from `0` (Int) to `0.0` (Double) so the fold accumulator is typed as Double and no integer truncation occurs on each addition step.
        return items.fold(0.0) { acc, item ->
            acc + item.amount
        }
    }
}
```

## Explanation

### Issue 1: fold Initial Value Causes Integer Truncation

**Problem:** Every invoice total comes out as a whole number — all cents are lost. On a 50-item invoice where each line item has a fractional cent component, the total can be off by tens of dollars depending on the amounts involved.

**Fix:** Replace the integer literal `0` with the Double literal `0.0` as the seed value passed to `fold`. This one-token change at the `fold(0.0)` call site is the entire fix.

**Explanation:** Kotlin's `fold` infers the accumulator type from the seed value. When the seed is `0` (an `Int`), the lambda signature becomes `(Int, LineItem) -> Int`. Inside the lambda, `acc + item.amount` promotes `acc` to `Double` for the addition, but the result is then narrowed back to `Int` to satisfy the inferred return type — discarding the fractional part. This happens on every single iteration, so the error accumulates across all line items. Changing the seed to `0.0` makes Kotlin infer the accumulator as `Double`, the lambda becomes `(Double, LineItem) -> Double`, and no truncation ever occurs. A related pitfall: if you ever change this to use `BigDecimal` for even higher precision, the seed must also be `BigDecimal.ZERO` — the same rule applies.

---
