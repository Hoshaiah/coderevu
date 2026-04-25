---
slug: enum-comparison-with-string
track: ruby
orderIndex: 17
title: ActiveRecord Enum String Comparison
difficulty: easy
tags:
  - active-record
  - idioms
  - correctness
language: ruby
---

## Context

This code lives in `app/models/order.rb` and a companion `app/controllers/admin/orders_controller.rb`. The `Order` model uses ActiveRecord's `enum` to track fulfillment state. The admin dashboard lets staff filter by status and manually transition orders.

Support started filing tickets saying the "pending orders" queue always shows empty even though the database clearly has rows with `status = 0`. The filter was working fine two months ago before a Rails upgrade from 5.2 to 6.1.

The team checked the SQL logs and confirmed the query runs, but returns zero rows even when rows exist. They also confirmed `Order.count` returns the right total. Nobody changed the filter logic itself.

## Buggy code

```ruby
class Order < ApplicationRecord
  enum status: { pending: 0, processing: 1, shipped: 2, delivered: 3, cancelled: 4 }

  scope :overdue, -> { where(status: "pending").where("created_at < ?", 3.days.ago) }
end

# app/controllers/admin/orders_controller.rb
class Admin::OrdersController < ApplicationController
  def index
    @orders = if params[:status].present?
                Order.where(status: params[:status])
              else
                Order.all
              end
    @pending_count = Order.where(status: "pending").count
  end
end
```
