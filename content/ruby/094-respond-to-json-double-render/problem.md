---
slug: respond-to-json-double-render
track: ruby
orderIndex: 94
title: Double Render in Error Branch
difficulty: easy
tags:
  - rails
  - idioms
  - error-handling
language: ruby
---

## Context

This action lives in `app/controllers/api/orders_controller.rb` in an e-commerce Rails 7 API. The action creates an order and is called from a React frontend. The controller inherits from `Api::BaseController` which sets `Content-Type: application/json` globally.

QA noticed that when order creation fails validation, the server logs show `AbstractController::DoubleRenderError` and the response body is sometimes empty or garbled. It only happens on the error path — successful order creation works fine.

The developer looked at the action and said "we're only calling render once" — and from reading the code it does appear that way. The bug is subtle enough that it passed code review.

## Buggy code

```ruby
class Api::OrdersController < Api::BaseController
  def create
    order = Order.new(order_params)

    if order.save
      render json: { id: order.id, status: order.status }, status: :created
    else
      render json: { errors: order.errors.full_messages }, status: :unprocessable_entity
    end

    # Log all order attempts for audit trail
    Rails.logger.info "Order attempt by user #{current_user.id}: #{order.errors.full_messages}"
  end

  private

  def order_params
    params.require(:order).permit(:product_id, :quantity, :address)
  end
end
```
