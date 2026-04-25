## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Orders index page generates hundreds of queries
# ------------------------------------------------------------------------
# app/controllers/admin/orders_controller.rb
class Admin::OrdersController < ApplicationController
  def index
    # CHANGE 1: eager-load :customer so ActiveRecord issues one JOIN/preload query instead of one SELECT per order when the view accesses order.customer
    # CHANGE 2: eager-load :order_items (and its :product) so the view does not fire a separate SELECT per order when iterating line items
    @orders = Order
      .order(created_at: :desc)
      .limit(100)
      .includes(:customer, order_items: :product)

    # CHANGE 3: if Kaminari or will_paginate is available, use .page instead of a raw .limit so the result set stays bounded as order volume grows. Replace the .limit(100) above with .page(params[:page]).per(50) if your project already has a pagination gem.
  end
end
```

## Explanation

### Issue 1: N+1 queries loading customers

**Problem:** The view accesses `order.customer` for each of the 100 orders. Because the controller loads orders with no eager loading, ActiveRecord runs a separate `SELECT * FROM customers WHERE id = ?` for every row — up to 100 extra queries per request.

**Fix:** Add `.includes(:customer)` to the ActiveRecord chain in `index`. This is the `CHANGE 1` site. ActiveRecord then issues a single `SELECT * FROM customers WHERE id IN (...)` to fetch all needed customers at once.

**Explanation:** When you access an association on a model instance that was not preloaded, ActiveRecord lazily fires a query at that moment. In a loop over 100 orders the lazy load runs 100 times. `.includes` tells ActiveRecord to load the association up front in one round-trip. If you need a JOIN for WHERE/ORDER clauses use `.eager_load`; for pure preloading `.includes` is sufficient and avoids a large JOIN result set. A related pitfall: if you later add a call like `order.customer.address`, you need to nest that association too — `.includes(customer: :address)`.

---

### Issue 2: N+1 queries loading order items

**Problem:** The view iterates `order.order_items` (and likely `item.product`) for each order. Without preloading, that fires one `SELECT * FROM order_items WHERE order_id = ?` per order and one `SELECT * FROM products WHERE id = ?` per item, producing hundreds of queries for a 100-order page.

**Fix:** Add `order_items: :product` inside `.includes(...)` at the `CHANGE 2` site. ActiveRecord then loads all order items for the 100 orders in one query and all referenced products in a second query.

**Explanation:** Nested associations require nested syntax in `.includes`: `includes(order_items: :product)` tells ActiveRecord to first batch-load `order_items` keyed by `order_id`, then batch-load `products` keyed by the `product_id` values found in those items. Each level adds exactly one extra query regardless of cardinality — two extra queries total instead of up to 100 × (avg items per order) extra queries. If `order_items` itself has further associations referenced in the view, each must be listed or the N+1 reappears at that level.

---

### Issue 3: Unbounded result set with raw LIMIT

**Problem:** `.limit(100)` hard-codes the page size with no way for the user to navigate to older orders, and as order volume grows the 100-row cut-off becomes arbitrary. There is also no index hint, so the `ORDER BY created_at DESC LIMIT 100` scan can be slow if the index is missing.

**Fix:** At the `CHANGE 3` site, replace `.limit(100)` with `.page(params[:page]).per(50)` using Kaminari (or the equivalent for will_paginate). This binds the query to a specific page, passes a proper `OFFSET`, and lets the view render pagination controls.

**Explanation:** A raw `LIMIT` always fetches the first N rows; operators cannot retrieve page 2 without a custom URL parameter wired to `OFFSET`. Pagination gems handle `OFFSET` arithmetic, expose helpers for rendering controls, and make the page size configurable. The underlying SQL — `ORDER BY created_at DESC LIMIT 50 OFFSET 0` — still benefits from an index on `(created_at DESC)`, so ensure that index exists; without it the database performs a full table sort before applying the limit.
