---
slug: params-to-i-skips-validation
track: ruby
orderIndex: 53
title: Integer Cast Hides Invalid Input
difficulty: easy
tags:
  - security
  - rails
  - idioms
language: ruby
---

## Context

`app/controllers/products_controller.rb` handles a paginated product listing. The `page` query parameter is converted to an integer to calculate the SQL `OFFSET`. The developer used `.to_i` to convert the string param, reasoning that it prevents SQL injection and avoids crashes on non-numeric input.

The QA team noticed that passing `page=abc` or `page=-5` does not return an error — it silently returns the first page or a nonsensical page offset. More critically, a penetration tester discovered that very large values like `page=99999999` cause the database to perform expensive full-table scans and time out, enabling a denial-of-service.

The team already uses strong parameters for mass-assignment protection but has not validated numeric query params.

## Buggy code

```ruby
class ProductsController < ApplicationController
  PER_PAGE = 20

  def index
    page = params[:page].to_i
    offset = page * PER_PAGE

    @products = Product.order(:name).limit(PER_PAGE).offset(offset)
    render json: @products
  end
end
```
