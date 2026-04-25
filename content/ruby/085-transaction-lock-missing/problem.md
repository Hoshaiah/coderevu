---
slug: transaction-lock-missing
track: ruby
orderIndex: 85
title: Inventory Decrement Without Lock
difficulty: hard
tags:
  - concurrency
  - active-record
  - race-condition
language: ruby
---

## Context

This code lives in `app/services/inventory_service.rb`. The service is called from two places: the web checkout flow and a background Sidekiq job that processes bulk orders from wholesale partners. Both paths can execute simultaneously under normal load, and the application runs with 8 Puma threads and 10 Sidekiq workers.

The warehouse team reported occasional negative inventory counts — items showing `-2` or `-3` in stock despite business logic that should prevent selling below zero. This only happens during flash sales when concurrent checkout volume spikes. The bug does not reproduce in development or staging (both run single-threaded).

The team added `puts` logging and confirmed the `sufficient_stock?` check passes for multiple concurrent callers before any of them commits the decrement. They're confident the bug is in the service layer, not the database constraints (no DB-level check constraint exists on the column).

## Buggy code

```ruby
class InventoryService
  def self.reserve(product_id:, quantity:)
    ActiveRecord::Base.transaction do
      product = Product.find(product_id)

      unless product.stock_count >= quantity
        raise InsufficientStockError, "Not enough stock for product #{product_id}"
      end

      product.stock_count -= quantity
      product.save!

      StockReservation.create!(
        product_id: product_id,
        quantity: quantity,
        reserved_at: Time.current
      )
    end
  end
end
```
