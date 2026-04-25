---
slug: n-plus-one-orders
track: ruby
orderIndex: 41
title: N+1 On Orders Index
difficulty: easy
tags:
  - n+1
  - active-record
  - performance
language: ruby
---

## Context

The admin "recent orders" page renders fine locally but p95 latency in production is ~6 seconds. The database shows thousands of nearly-identical `SELECT ... WHERE customer_id = ?` and `SELECT ... WHERE order_id = ?` queries per request.

## Buggy code

```ruby
# app/controllers/admin/orders_controller.rb
class Admin::OrdersController < ApplicationController
  def index
    @orders = Order.order(created_at: :desc).limit(100)
  end
end
```

```erb
<%# app/views/admin/orders/index.html.erb %>
<table>
  <% @orders.each do |order| %>
    <tr>
      <td><%= order.id %></td>
      <td><%= order.customer.name %></td>
      <td><%= order.customer.email %></td>
      <td><%= order.line_items.sum(&:total_cents) %></td>
      <td><%= order.payments.last&.status %></td>
    </tr>
  <% end %>
</table>
```
