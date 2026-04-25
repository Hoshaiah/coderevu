---
slug: inject-sum-skips-first-element
track: ruby
orderIndex: 5
title: Inject With Symbol Skips Element
difficulty: easy
tags:
  - idioms
  - ruby
  - enumerable
language: ruby
---

## Context

`lib/reports/revenue_calculator.rb` is a small utility used by the nightly billing job to compute total revenue from a list of `LineItem` value objects. Each `LineItem` has an `amount` attribute that is a `BigDecimal`. The calculator has been in production for months without apparent issues.

The on-call engineer noticed that the revenue report was consistently short by exactly the amount of the very first line item in every invoice. The discrepancy is small on low-volume invoices but large on high-value orders, and it appeared in the database reconciliation audit last quarter.

The team already confirmed the input data is correct — all `LineItem` objects are present and carry the right `amount`. The issue is isolated to the summation step itself.

## Buggy code

```ruby
class RevenueCalculator
  def self.total(line_items)
    line_items.map(&:amount).inject(:+)
  end
end

# Example usage:
# items = [
#   LineItem.new(amount: BigDecimal('100.00')),
#   LineItem.new(amount: BigDecimal('50.00')),
#   LineItem.new(amount: BigDecimal('25.00')),
# ]
# RevenueCalculator.total(items)  # => 175.0  (correct when list has >=1 element)
#
# But:
# RevenueCalculator.total([])     # => nil instead of 0
# Downstream code does:  total + tax  which raises NoMethodError on nil
```
