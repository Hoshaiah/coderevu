## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — N+1 on Category Products Page
# ------------------------------------------------------------------------

# app/controllers/categories_controller.rb
class CategoriesController < ApplicationController
  def index
    # CHANGE 1: eager-load `products` association up front to avoid one SELECT per category; `featured` and `limit` on a preloaded scope won't re-query when accessed in the view only if we load the full set here, so we use `includes` with a nested `brands` to cover both N+1s.
    # CHANGE 2: include `brands` inside the products eager-load so `product.brand.name` in the view reads from memory instead of issuing one SELECT per product.
    @categories = Category.where(active: true)
                          .order(:position)
                          .includes(products: :brand) # CHANGE 1 & CHANGE 2: bulk-loads products and their brands in two extra queries regardless of category/product count
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

## Explanation

### Issue 1: Per-category products query (N+1)

**Problem:** The view calls `category.products.featured.limit(3)` inside a loop over every category. With 1 200 categories, ActiveRecord runs 1 200 separate `SELECT` statements against the `products` table — one per category object — causing the page to take 14 seconds.

**Fix:** Add `.includes(products: :brand)` to the query in `CategoriesController#index`. This replaces the 1 200 per-category SELECTs with a single bulk SELECT that loads all products for all active categories at once.

**Explanation:** Without eager-loading, the `products` association on each `Category` instance is uninitialized. The first time the view touches `category.products`, ActiveRecord executes `SELECT * FROM products WHERE category_id = ?` with that category's id. Doing this 1 200 times in a loop is what New Relic is counting. Adding `includes` tells ActiveRecord to run `SELECT * FROM products WHERE category_id IN (1, 2, …, 1200)` once after the categories are fetched, populating the in-memory association cache. After that, `category.products` in the view reads from memory and fires no SQL. One pitfall: calling a new scope like `.featured.limit(3)` on an already-loaded `has_many` in Rails will re-query the database if the scope isn't satisfied by the cached records. If `featured` is defined as a pure Ruby filter or the view uses `select`/`first` on the already-loaded array, it stays in memory; if it re-scopes to SQL you may need to restructure the query or load the subset differently.

---

### Issue 2: Per-product brand query (N+1)

**Problem:** The view calls `product.brand.name` for every product rendered. With 1 200 categories × 3 products each, that is up to 3 600 `SELECT * FROM brands WHERE id = ?` queries — one per product — on top of the category-level N+1.

**Fix:** Nest `:brand` inside the `includes` call as `includes(products: :brand)`. ActiveRecord then runs a single `SELECT * FROM brands WHERE id IN (…)` covering all brand ids referenced by the loaded products.

**Explanation:** ActiveRecord's `belongs_to :brand` on `Product` is lazy by default. The first time the view reads `product.brand`, Rails checks whether the association is loaded in the object's internal cache. Without eager-loading, it isn't, so ActiveRecord hits the database. Because this happens inside a loop over already-iterated products, there is no way for Rails to batch the lookups automatically — each call sees a single `product` object with no knowledge of the surrounding loop. Nesting `:brand` in `includes` solves this by collecting all `brand_id` values from the loaded products and fetching them in one IN query, after which every `product.brand` call reads the pre-populated cache. A related pitfall: if `Brand` has further associations rendered in the view (e.g., `brand.logo`), those will become a new N+1 — extend the `includes` chain to `includes(products: { brand: :logo })` as needed.
