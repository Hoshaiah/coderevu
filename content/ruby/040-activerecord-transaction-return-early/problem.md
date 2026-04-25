---
slug: activerecord-transaction-return-early
track: ruby
orderIndex: 40
title: Early Return Skips Transaction Rollback
difficulty: hard
tags:
  - active-record
  - rails
  - concurrency
  - error-handling
language: ruby
---

## Context

`app/services/order_fulfillment_service.rb` is called from a webhook handler when a payment succeeds. It decrements stock, creates a shipment record, and marks the order as `"fulfilled"` — all inside an ActiveRecord transaction to keep the database consistent.

Operators have reported inventory going negative and shipments being created for orders that are still in `"pending"` state. The discrepancy is always for orders where the stock level was exactly 0 at the time of the webhook.

The service was audited for exception handling and all exceptions are re-raised correctly. No deadlocks appear in the Postgres logs. The issue reproduces reliably in staging when an order arrives while stock is 0.

## Buggy code

```ruby
# app/services/order_fulfillment_service.rb
class OrderFulfillmentService
  def self.call(order)
    ActiveRecord::Base.transaction do
      product = Product.lock.find(order.product_id)

      if product.stock_count <= 0
        order.update!(status: "out_of_stock")
        return false
      end

      product.decrement!(:stock_count)
      Shipment.create!(order: order, address: order.shipping_address)
      order.update!(status: "fulfilled")
    end

    true
  end
end
```
