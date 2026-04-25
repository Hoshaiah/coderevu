## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Inventory Decrement Without Lock
# ------------------------------------------------------------------------

class InventoryService
  def self.reserve(product_id:, quantity:)
    ActiveRecord::Base.transaction do
      # CHANGE 1: Use lock: true (SELECT ... FOR UPDATE) so only one transaction reads and decrements at a time; without this, concurrent transactions all pass the stock check before any commit.
      product = Product.find(product_id, lock: true)

      unless product.stock_count >= quantity
        raise InsufficientStockError, "Not enough stock for product #{product_id}"
      end

      product.stock_count -= quantity
      product.save!

      StockReservation.create!(
        product_id: product_id,
        quantity: quantity,
        reserved_at: Time.current
      )
    end
  end

  # CHANGE 2: Call this migration helper at deploy time (or place the content in a migration) to add a DB-level check constraint so stock_count can never go below zero regardless of application bugs.
  def self.add_stock_check_constraint
    ActiveRecord::Base.connection.execute(
      "ALTER TABLE products ADD CONSTRAINT stock_count_non_negative CHECK (stock_count >= 0)"
    )
  end
end
```

## Explanation

### Issue 1: Unguarded Concurrent Read-Modify-Write

**Problem:** During a flash sale, 8+ threads execute `reserve` simultaneously. Each one reads `stock_count` at nearly the same moment, all see a value large enough to satisfy the `>=` check, all subtract `quantity`, and all commit. The final `stock_count` in the database is the result of several independent decrements from the same starting value, which can go negative by however many concurrent callers there were.

**Fix:** Replace `Product.find(product_id)` with `Product.find(product_id, lock: true)` at the CHANGE 1 site. This emits `SELECT ... FOR UPDATE`, which makes the database serialize access to that row for the duration of the transaction.

**Explanation:** A regular `SELECT` inside a transaction does not block other transactions from also reading the same row. Two transactions can both read `stock_count = 1`, both pass the `>= 1` check, and both commit a write of `0`  — but because they each started from `1` the real outcome is `-0` or worse. `SELECT ... FOR UPDATE` places a row-level lock so the second transaction blocks at the `find` call until the first transaction commits or rolls back. Once the first commit lands (with the decremented value), the second transaction reads the new value, and the guard now correctly rejects it if stock is gone. This works because both the web Puma threads and the Sidekiq workers share the same PostgreSQL (or MySQL) connection pool and the database enforces the lock across all callers.

---

### Issue 2: No Database-Level Check Constraint on stock_count

**Problem:** The only thing preventing a negative `stock_count` is the application-layer `>=` check. Any code path that skips `InventoryService`, a direct Rails console update, a migration bug, or a future developer calling `product.update!(stock_count: -5)` will silently write a negative value with no error from the database.

**Fix:** At the CHANGE 2 site, a `CHECK (stock_count >= 0)` constraint is added to the `products` table via raw SQL. In practice this belongs in a Rails migration (`add_check_constraint :products, 'stock_count >= 0', name: 'stock_count_non_negative'` on Rails 6.1+), but the method shown illustrates the intent.

**Explanation:** A check constraint is enforced by the database engine at write time, regardless of which application, thread, or tool issues the `INSERT` or `UPDATE`. If Issue 1's fix is ever regressed or a new code path bypasses the lock, the database will raise an exception before the negative value commits. This is a defense-in-depth measure: the application guard is the first line, the lock is the second, and the constraint is the last. Without it, the table silently accumulates corrupt data that only surfaces when the warehouse team notices a `-2` on their dashboard.
