## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Inject With Symbol Skips Element
# ------------------------------------------------------------------------

class RevenueCalculator
  def self.total(line_items)
    # CHANGE 1: provide BigDecimal('0') as the explicit initial accumulator so an empty list returns 0 instead of nil, and every element (including the first) is summed rather than used as the seed.
    line_items.map(&:amount).inject(BigDecimal('0'), :+)
  end
end

# Example usage:
# items = [
#   LineItem.new(amount: BigDecimal('100.00')),
#   LineItem.new(amount: BigDecimal('50.00')),
#   LineItem.new(amount: BigDecimal('25.00')),
# ]
# RevenueCalculator.total(items)  # => BigDecimal('175.00')  (correct)
#
# RevenueCalculator.total([])     # => BigDecimal('0')  (no longer nil)
```

## Explanation

### Issue 1: Missing Initial Accumulator Value

**Problem:** When `line_items` is empty, `inject(:+)` returns `nil` because there is no element to serve as the starting accumulator and no explicit seed was given. Downstream code then calls `total + tax`, which raises `NoMethodError: undefined method '+' for nil`. Even for non-empty lists, `inject` without an initial value uses the first element as the seed and starts iterating from the second element — so if the mapped values were not already plain numerics, the first item would be silently skipped.

**Fix:** Pass `BigDecimal('0')` as the first argument to `inject` at the `CHANGE 1` site, changing `inject(:+)` to `inject(BigDecimal('0'), :+)`. This gives `inject` an explicit starting value so it always returns a `BigDecimal`, never `nil`, and includes every element in the sum.

**Explanation:** Ruby's `Enumerable#inject` has two call signatures: with an initial value (`inject(seed, symbol)`) and without (`inject(symbol)`). Without a seed, `inject` takes the first element of the collection as the accumulator and begins the reduction from the second element onward. For a one-element list this still works because nothing is added to the seed — the single element is returned directly. For an empty list, however, there is no first element to act as the seed, so `inject` returns `nil`. Providing `BigDecimal('0')` as the explicit seed means the accumulator starts at zero and every element, including the first, is added to it. Using `BigDecimal('0')` rather than the integer `0` also preserves the `BigDecimal` type throughout the reduction, which matters for financial arithmetic where precision and type consistency are required — mixing `BigDecimal` and `Float` via integer `0` can introduce floating-point imprecision.

---
