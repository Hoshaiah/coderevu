---
slug: integer-safe-navigation-nil-sum
track: ruby
orderIndex: 4
title: Safe Navigation Returns Nil in Calculation
difficulty: easy
tags:
  - idioms
  - ruby
  - nil-handling
language: ruby
---

## Context

This code is in `app/models/cart.rb` in an e-commerce application. The `total` method computes the cart's subtotal including any discount from a coupon. It was refactored to use the safe navigation operator (`&.`) to avoid a `NoMethodError` when no coupon is applied.

Customers report that sometimes their cart shows a blank or `nil` total in the checkout UI, rather than the correct price. The bug appears only for carts that have a coupon applied, and only for certain coupon configurations. The Rails logs show no exceptions.

A developer checked the coupon records and confirmed the `discount_amount` column is populated for all affected coupons.

## Buggy code

```ruby
class Cart < ApplicationRecord
  belongs_to :coupon, optional: true

  def line_item_total
    line_items.sum(:price)
  end

  def total
    discount = coupon&.discount_amount
    line_item_total - discount
  end
end
```
