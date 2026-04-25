## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Safe Navigation Returns Nil in Calculation
# ------------------------------------------------------------------------

class Cart < ApplicationRecord
  belongs_to :coupon, optional: true

  def line_item_total
    line_items.sum(:price)
  end

  def total
    # CHANGE 1: Use `|| 0` so that when coupon is nil (safe navigation short-circuits to nil) OR when discount_amount itself is nil, discount defaults to 0 instead of nil, preventing nil arithmetic.
    discount = coupon&.discount_amount || 0
    line_item_total - discount
  end
end
```

## Explanation

### Issue 1: Safe Navigation Yields Nil Discount

**Problem:** When a cart has no coupon, `coupon&.discount_amount` correctly short-circuits and returns `nil`. But `line_item_total - nil` is not valid arithmetic in Ruby — it either raises a `TypeError` or, when `line_item_total` returns an `ActiveSupport::NumericWithFormat` or similar decorated numeric, silently produces `nil`. Customers see a blank total in checkout.

**Fix:** Append `|| 0` after `coupon&.discount_amount` so the expression becomes `coupon&.discount_amount || 0`. This is the `# CHANGE 1` site. When the safe navigation returns `nil`, the `|| 0` substitutes a numeric zero, keeping the subtraction valid.

**Explanation:** The `&.` operator returns `nil` when the receiver is `nil` — that is its entire purpose. The problem is that the result of `coupon&.discount_amount` flows directly into a subtraction without any guard. Ruby's `-` method on `Integer` or `BigDecimal` does not know how to subtract `nil`, so it raises `TypeError: nil can't be coerced into Integer`. The Rails log may suppress or swallow this depending on where it is caught in the view, which is why no exception appears prominently. Adding `|| 0` is the minimal, idiomatic Ruby fix: it handles both the nil-coupon case and the edge case where `discount_amount` is stored as `NULL` in the database and returns `nil` through ActiveRecord.

---

### Issue 2: No Nil Guard on Discount Arithmetic

**Problem:** Even when a coupon record exists, `discount_amount` can be `nil` if the database column has a `NULL` value for that row (or the column has no `NOT NULL` constraint and no default). In that case `coupon&.discount_amount` returns `nil` without triggering the safe navigation short-circuit, and the subsequent subtraction silently produces `nil` rather than raising loudly.

**Fix:** The same `|| 0` added at `# CHANGE 1` covers this case as well. `nil || 0` evaluates to `0` regardless of whether `nil` came from the safe navigation short-circuit or from an actual `nil` column value.

**Explanation:** The safe navigation operator only short-circuits when the *receiver* (`coupon`) is `nil`; it does not inspect the *return value* of the method it calls. So `coupon&.discount_amount` when `coupon` is a valid record but `discount_amount` is `NULL` will return `nil` just the same as if the record had a populated value. The developer confirmed `discount_amount` is populated for affected coupons, which points to this being the nil-coupon path, but the `|| 0` guard is important to have for both paths. A related pitfall: relying on a database `NOT NULL DEFAULT 0` constraint is good practice too, but the application layer should still be defensive so behavior is consistent even if schema guarantees are ever relaxed.
