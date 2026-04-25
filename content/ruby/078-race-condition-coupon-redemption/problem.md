---
slug: race-condition-coupon-redemption
track: ruby
orderIndex: 78
title: Race Condition In Coupon Redemption
difficulty: hard
tags:
  - concurrency
  - race-condition
  - active-record
  - locking
language: ruby
---

## Context

The checkout flow checks whether a coupon has remaining uses before applying it to an order. In a load test simulating Black Friday traffic, coupons with a `max_uses` of 1 were redeemed 12–15 times each.

The business confirmed real monetary loss occurred in the previous campaign because of this.

## Buggy code

```ruby
# app/services/coupon_redemption_service.rb
class CouponRedemptionService
  def initialize(coupon, order)
    @coupon = coupon
    @order  = order
  end

  def call
    if @coupon.times_used < @coupon.max_uses
      @order.update!(discount_cents: @coupon.discount_cents)
      @coupon.increment!(:times_used)
      true
    else
      false
    end
  end
end
```
