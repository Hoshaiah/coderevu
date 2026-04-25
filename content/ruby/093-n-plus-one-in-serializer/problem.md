---
slug: n-plus-one-in-serializer
track: ruby
orderIndex: 93
title: API response time grows linearly with the number of records returned
difficulty: medium
tags:
  - performance
  - n-plus-one
  - activerecord
language: ruby
---

## Context

A REST API endpoint returns a paginated list of orders with each order's customer name. Load testing revealed that the endpoint takes 40ms for 10 records but over 2 seconds for 100 records, a clearly non-linear relationship. The database is appropriately indexed and the queries themselves are fast — there are just far too many of them.

## Buggy code

```ruby
class OrdersController < ApplicationController
  def index
    @orders = Order.page(params[:page]).per(100)
    render json: @orders.map { |order| serialize(order) }
  end

  private

  def serialize(order)
    {
      id: order.id,
      total: order.total_cents,
      placed_at: order.placed_at,
      customer_name: order.customer.full_name,
      item_count: order.line_items.count
    }
  end
end
```
