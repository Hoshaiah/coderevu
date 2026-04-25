## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — API response time grows linearly with the number of records returned
# ------------------------------------------------------------------------
class OrdersController < ApplicationController
  def index
    # CHANGE 1: eager-load :customer so one JOIN/query fetches all customers up front
    # CHANGE 2: eager-load :line_items so counts come from in-memory arrays, not per-row COUNT queries
    @orders = Order.includes(:customer, :line_items).page(params[:page]).per(100)
    render json: @orders.map { |order| serialize(order) }
  end

  private

  def serialize(order)
    {
      id: order.id,
      total: order.total_cents,
      placed_at: order.placed_at,
      customer_name: order.customer.full_name, # CHANGE 1: now reads from already-loaded association, no extra query
      item_count: order.line_items.size        # CHANGE 2: .size on a loaded association counts in Ruby, no extra COUNT query
    }
  end
end
```

## Explanation

### Issue 1: N+1 query on customer association

**Problem:** For a page of 100 orders, `order.customer.full_name` triggers a separate `SELECT * FROM customers WHERE id = ?` for every single order. A page of 100 records produces 101 queries: one for the orders and one per customer lookup. Response time grows linearly with page size.

**Fix:** Add `:customer` to an `includes` call on the initial scope — `Order.includes(:customer, :line_items)`. In `serialize`, `order.customer.full_name` now reads from the already-loaded in-memory object instead of hitting the database.

**Explanation:** ActiveRecord lazy-loads associations by default. When the `serialize` method accesses `order.customer` on a plain `Order` instance, ActiveRecord has no cached result and issues a fresh `SELECT`. Calling `includes(:customer)` tells ActiveRecord to fetch all associated customers in one additional query (or a single JOIN, depending on Rails version and other scopes) before the `.map` loop runs. Because the association is already populated in memory, subsequent calls to `order.customer` inside the loop return the cached object. A related pitfall: if you later add a `.where` on the customer inside `serialize`, Rails may bypass the preloaded cache and issue new queries anyway — keep filtering on the initial scope instead.

---

### Issue 2: N+1 COUNT query on line_items association

**Problem:** `order.line_items.count` issues a `SELECT COUNT(*) FROM line_items WHERE order_id = ?` for every order in the result set. On a page of 100 orders that is 100 extra round-trips to the database, on top of the customer lookups.

**Fix:** Add `:line_items` to the same `includes` call — `Order.includes(:customer, :line_items)` — and change `order.line_items.count` to `order.line_items.size` in `serialize`.

**Explanation:** ActiveRecord's `count` method always delegates to SQL, even when the association is already loaded. The `size` method checks whether the association target is already loaded; if it is, it calls `.length` on the Ruby array and never touches the database. By including `:line_items` in the initial scope, all line items for the current page are fetched in a single `SELECT line_items.* FROM line_items WHERE order_id IN (...)` before the loop starts. Inside the loop, `order.line_items.size` then operates purely in memory. One pitfall: if you call `order.line_items.count` (not `size`) even after `includes`, Rails still fires the COUNT query — the distinction between `count` and `size` is meaningful and easy to confuse.
