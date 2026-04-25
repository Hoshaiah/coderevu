## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Early Return Skips Transaction Rollback
# ------------------------------------------------------------------------

# app/services/order_fulfillmentservice.rb
class OrderFulfillmentService
  # CHANGE 2: define a dedicated exception class so callers can rescue a named error and the raise propagates out of the transaction block, triggering rollback.
  OutOfStockError = Class.new(StandardError)

  def self.call(order)
    ActiveRecord::Base.transaction do
      product = Product.lock.find(order.product_id)

      if product.stock_count <= 0
        order.update!(status: "out_of_stock")
        # CHANGE 1: raise instead of `return false` so that execution leaves the block via an exception, which causes ActiveRecord to roll back the transaction before the exception propagates up the call stack.
        raise OutOfStockError, "Product #{product.id} is out of stock"
      end

      product.decrement!(:stock_count)
      Shipment.create!(order: order, address: order.shipping_address)
      order.update!(status: "fulfilled")
    end

    true
  rescue OutOfStockError
    # CHANGE 2: rescue the named error here, outside the transaction, so the rollback has already happened; return false to preserve the original boolean contract with callers.
    false
  end
end
```

## Explanation

### Issue 1: `return` Inside Transaction Bypasses Rollback

**Problem:** When `stock_count` is 0, the service calls `order.update!(status: 'out_of_stock')` and then executes `return false`. That `return` jumps out of the method entirely — including out of the `transaction` block — without raising an exception. ActiveRecord only rolls back a transaction when an exception propagates out of the block, so the `update!` on the order is silently committed. Operators see orders stuck in `'out_of_stock'` while inventory is untouched, and subsequent webhooks may still create shipments against those orders.

**Fix:** Replace `return false` with `raise OutOfStockError` at the CHANGE 1 site. The exception propagates out of the `transaction` block, ActiveRecord rolls back all writes including the `order.update!`, and the database stays consistent.

**Explanation:** `ActiveRecord::Base.transaction` wraps its block in a database transaction and issues a `ROLLBACK` only when an exception escapes the block. A bare `return` is a Ruby control-flow exit — it unwinds the Ruby call stack and returns to the caller, but from PostgreSQL's perspective the connection just received a `COMMIT` (the default when the block finishes without error). So every statement executed before the `return` — here, the `order.update!` — is permanently written. Raising an exception instead forces ActiveRecord's `ensure` clause inside `transaction` to run `ROLLBACK` before letting the exception propagate further. One related pitfall: `rescue`-ing an exception *inside* the transaction block and not re-raising has the same effect as `return` — the block completes normally and the transaction commits.

---

### Issue 2: Silent `false` Return Obscures Out-of-Stock Failure to Callers

**Problem:** Even if the rollback were working, returning `false` from the service on an out-of-stock condition gives callers no structured way to know *why* the call failed. A caller that checks `if OrderFulfillmentService.call(order)` treats out-of-stock identically to any other falsy return and may silently swallow the failure, leading to no retry, no alert, and an order left in an ambiguous state.

**Fix:** At the CHANGE 2 site, define `OutOfStockError = Class.new(StandardError)` and `rescue` it outside the `transaction` block to return `false`. The named exception class lets callers `rescue OrderFulfillmentService::OutOfStockError` explicitly if they need distinct handling, while the default path still returns `false` to preserve backward compatibility with callers that only check the boolean.

**Explanation:** Using a named exception rather than a bare `false` creates a contract: anything that goes wrong inside the transaction raises, and callers outside can decide whether to handle it or let it bubble. Rescuing `OutOfStockError` *after* the `transaction` block is the right place because by the time execution reaches that `rescue`, the rollback has already happened — the database is clean. If you rescued it inside the `transaction` block instead, the block would complete without raising and ActiveRecord would commit the partial writes, reproducing the original bug. Keeping the `rescue` outside also means any unexpected exception (a network error during `Shipment.create!`, for example) still propagates unhandled to the caller, which is the correct behavior.
