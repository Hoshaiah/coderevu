## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — inject Missing Initial Accumulator
# ------------------------------------------------------------------------

LineItem = Struct.new(:description, :unit_price, :quantity)

module Billing
  class InvoiceCalculator
    def self.subtotal(line_items)
      # CHANGE 1: Supply 0 as the explicit initial accumulator so that `sum` is always a Numeric, even when `line_items` has exactly one element; without it, Ruby uses the first element itself as `sum` and never passes it through the block.
      line_items.inject(0) do |sum, item|
        sum + (item.unit_price * item.quantity)
      end
    end

    def self.total_with_tax(line_items, tax_rate:)
      sub = subtotal(line_items)
      # CHANGE 2: `subtotal` now always returns a Numeric, so this arithmetic is safe; previously a single-item list made `sub` a LineItem struct and `sub * tax_rate` would raise NoMethodError here too.
      sub + (sub * tax_rate)
    end
  end
end

items = [LineItem.new("Widget", 9.99, 3)]
puts Billing::InvoiceCalculator.subtotal(items) # => 29.97
```

## Explanation

### Issue 1: Missing initial accumulator in `inject`

**Problem:** When `line_items` contains exactly one element, `inject` without an initial value skips the block entirely and returns the first element unchanged — the `LineItem` struct. Downstream code that calls `.round(2)` or passes the result to a currency formatter crashes with `NoMethodError: undefined method 'round' for #<struct LineItem ...>`.

**Fix:** Add `0` as the first argument to `inject`, changing `line_items.inject do` to `line_items.inject(0) do`. This gives the accumulator a known numeric starting value regardless of collection size.

**Explanation:** Ruby's `Enumerable#inject` has two calling conventions. When you omit the initial value, it pulls the first element out of the collection and uses it as the starting `sum`, then iterates over the *remaining* elements. With two or more items, the first `LineItem` becomes `sum` and the second item becomes `item`, so `sum + (item.unit_price * item.quantity)` calls `+` on a `LineItem` — which happens to work only because the struct delegates arithmetic if the first `LineItem` is implicitly treated as a number, but in a single-item list no iteration happens at all and the raw struct is returned. Passing `0` means `sum` is always a `Float`/`Integer`, and every element including the first goes through the multiplication block. A related pitfall: `inject` on an empty array with no initial value raises `LocalJumpError`; with `0` it safely returns `0`, which is the correct subtotal for an empty invoice.

---

### Issue 2: `total_with_tax` inherits the struct-return bug

**Problem:** `total_with_tax` calls `subtotal` and then does `sub + (sub * tax_rate)`. On a single-item invoice, `sub` is a `LineItem` struct, so `sub * tax_rate` immediately raises `NoMethodError`. The monthly batch billing script hits this path for every single-subscription invoice and fails silently mid-run, leaving those customers un-billed.

**Fix:** The fix to Issue 1 is the root cause fix; the CHANGE 2 comment at the arithmetic line in `total_with_tax` documents that this line is now safe because `subtotal` is guaranteed to return a `Numeric`.

**Explanation:** `total_with_tax` itself has no independent bug — it is entirely dependent on what `subtotal` returns. Once `subtotal` always returns a number, the multiplication `sub * tax_rate` works correctly for all collection sizes. The reason this is called out as a separate issue is that the failure surface is different: the web checkout flow calls `subtotal` directly and sees the struct, while the batch script calls `total_with_tax` and sees a `NoMethodError` on `*`. Both symptoms trace to the same missing accumulator, but they manifest at different call sites and produce different error messages, which can make the root cause harder to locate during an incident.
