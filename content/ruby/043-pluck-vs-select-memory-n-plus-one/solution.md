## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — N+1 Inside Select Block
# ------------------------------------------------------------------------

class Report::MonthlySummaryService
  def self.call(month: Date.current.beginning_of_month)
    period_start = month
    period_end = month.end_of_month

    # CHANGE 2: Add :customer to includes so all customer rows are fetched in one query instead of one per order.
    orders = Order.where(created_at: period_start..period_end)
                  .where(status: :completed)
                  .includes(:line_items, :customer)

    # CHANGE 1: Replace the Ruby Enumerable `select` block (which calls order.customer per iteration) with `reject` after preloading; customer is now accessed from the in-memory cache populated by includes, so no extra queries fire.
    summary = orders.reject { |order| !order.customer.active? }
                    .group_by { |order| order.customer_id }
                    .transform_values do |customer_orders|
                      {
                        total: customer_orders.sum(&:total_cents),
                        count: customer_orders.size
                      }
                    end

    summary
  end
end
```

## Explanation

### Issue 1: N+1 queries in `select` block

**Problem:** Every iteration of `orders.select { |order| order.customer.active? }` triggers ActiveRecord to run a separate `SELECT * FROM customers WHERE id = ?` query for each order. With 10,000+ orders in a month, this produces 10,000+ individual round-trips to the database, which is why the job runs 8–12 minutes instead of under 5.

**Fix:** Add `:customer` to the `includes` call (CHANGE 2) so ActiveRecord loads all customer rows in one or two queries up front. Then the `select` / `reject` block (CHANGE 1) reads `order.customer` from the in-memory association cache, firing zero additional queries.

**Explanation:** Ruby's `Enumerable#select` on an ActiveRecord relation loads all records into an array and then calls the block once per element. Each `order.customer` call checks whether the association is already loaded; without `includes(:customer)`, it is not, so ActiveRecord issues a fresh SQL query every time. Adding `:customer` to `includes` tells ActiveRecord to batch-load all associated customers before iteration begins (using either a single JOIN or a `WHERE id IN (...)` query). After that, `order.customer` returns the already-loaded object from memory. A related pitfall: if you pass the relation to another method that calls `.to_a` or any enumerable method before `includes` can run, the preload never fires — always confirm `includes` is on the same scope that gets iterated.

---

### Issue 2: `:customer` missing from `includes`

**Problem:** The original `includes` only specifies `:line_items`, so the `:customer` association is never preloaded. Even if the developer intended to avoid N+1 queries, omitting `:customer` from `includes` means ActiveRecord has no batch-loaded cache to draw from, and each `order.customer` access hits the database.

**Fix:** Replace `.includes(:line_items)` with `.includes(:line_items, :customer)` (CHANGE 2), adding `:customer` as a second symbol in the same `includes` call.

**Explanation:** `includes` accepts one or more association names. When you supply `:customer`, ActiveRecord collects all `customer_id` values from the loaded orders and issues a single `SELECT * FROM customers WHERE id IN (...)` to hydrate all of them at once. Without this, the association cache for `:customer` is empty at iteration time, so each access falls back to a per-record query. Note that `includes` can also accept a hash for nested associations (e.g., `includes(customer: :address)`); adding only `:customer` here is enough because `active?` is a method on the customer model itself, not on a nested record.
