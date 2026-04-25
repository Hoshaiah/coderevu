---
slug: n-plus-one-category-products
track: ruby
orderIndex: 47
title: N+1 on Category Products Page
difficulty: medium
tags:
  - n+1
  - active-record
  - rails
  - performance
language: ruby
---

## Context

`app/controllers/categories_controller.rb` powers the storefront's category listing page. Each category card shows up to three featured products with their name, price, and the name of the brand that manufactures them. The action was written during early development when the catalog had fewer than 20 products.

After a catalog import added 1 200 categories with an average of 40 products each, the page load time climbed to 14 seconds. New Relic shows 2 400+ SQL queries per request, all hitting `products` and `brands` tables one row at a time.

The template was ruled out as the source — adding `to_a` logging in the controller confirmed the queries fire during the controller action itself.

## Buggy code

```ruby
# app/controllers/categories_controller.rb
class CategoriesController < ApplicationController
  def index
    @categories = Category.where(active: true).order(:position)
  end
end

# app/views/categories/index.html.erb (abbreviated)
# <% @categories.each do |category| %>
#   <% category.products.featured.limit(3).each do |product| %>
#     <%= product.name %> — <%= product.price %>
#     by <%= product.brand.name %>
#   <% end %>
# <% end %>
```
