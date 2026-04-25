---
slug: strong-params-nested-permit-missing
track: ruby
orderIndex: 58
title: Nested Permit Strips Address Data
difficulty: medium
tags:
  - security
  - rails
  - active-record
language: ruby
---

## Context

`app/controllers/orders_controller.rb` handles order creation including a nested shipping address. The controller was written quickly during a sprint and the `permit` call was considered complete because orders were saving without errors. The feature shipped and has been running for three months.

Customer support started receiving complaints that orders were arriving at wrong addresses — specifically at the default address on file rather than the one entered at checkout. Backend engineers could see the address form data in request logs but it was absent from the saved order record. No exception was raised anywhere in the stack.

Strong Parameters silently discards unpermitted keys rather than raising in production, so the data loss went undetected by automated tests that only checked HTTP status codes.

## Buggy code

```ruby
class OrdersController < ApplicationController
  def create
    @order = current_user.orders.build(order_params)
    if @order.save
      redirect_to @order, notice: "Order placed!"
    else
      render :new
    end
  end

  private

  def order_params
    params.require(:order).permit(
      :product_id,
      :quantity,
      :notes,
      :shipping_address
    )
  end
end
```
