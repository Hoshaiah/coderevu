## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Coupon codes can be redeemed more times than their usage limit under concurrent load
# ------------------------------------------------------------------------
# app/services/coupon_redemption_service.rb
class CouponRedemptionService
  def initialize(coupon, order)
    @coupon = coupon
    @order  = order
  end

  def call
    # CHANGE 1: Wrap everything in a transaction and use a pessimistic lock (SELECT ... FOR UPDATE) on the coupon row so only one request at a time can read and mutate times_used. Without this, concurrent requests all read the same times_used value before any increment is committed.
    # CHANGE 2: The transaction ensures both the order update and the coupon increment succeed or fail together, preventing partial state.
    ActiveRecord::Base.transaction do
      # CHANGE 1: lock! reloads the coupon row with FOR UPDATE, serializing access
      @coupon.lock!

      if @coupon.times_used < @coupon.max_uses
        @order.update!(discount_cents: @coupon.discount_cents) # CHANGE 2: inside transaction
        @coupon.increment!(:times_used)                        # CHANGE 2: inside transaction
        true
      else
        false
      end
    end
  end
end
```

## Explanation

### Issue 1: Race condition on coupon usage check

**Problem:** Under concurrent load, many requests read `times_used` at the same moment, all see a value below `max_uses`, and all proceed to apply the discount and increment the counter. A coupon with `max_uses: 1` ends up redeemed dozens of times because no request sees the incremented value until after it has already passed the guard.

**Fix:** Call `@coupon.lock!` inside a transaction before reading `times_used`. This issues a `SELECT ... FOR UPDATE` on the coupon row, so each concurrent request must wait for the previous one to commit before it can read or modify the row.

**Explanation:** The original code performs a read (`times_used < max_uses`) and then a write (`increment!`) as two separate, non-atomic database operations. Between those two operations, any number of other requests can execute their own read and see the pre-increment value. `lock!` acquires a row-level exclusive lock at the database level, turning the check-then-act into a serialized critical section. Each request now waits its turn: once the first request increments `times_used` and commits, the next request acquires the lock, reloads the now-updated value, and correctly finds it at or above `max_uses`. One related pitfall: `with_lock` is a convenience wrapper that calls `lock!` inside a new transaction automatically — it is an equally valid alternative to the explicit `transaction` + `lock!` pair used here.

---

### Issue 2: Missing transaction around order update and counter increment

**Problem:** If `@order.update!` succeeds but `@coupon.increment!` then raises (network blip, validation error, deadlock retry), the order gets a discount but the coupon's `times_used` counter is never incremented. The coupon appears to have a free use remaining even though a discount was already granted.

**Fix:** Both `@order.update!` and `@coupon.increment!` are moved inside an `ActiveRecord::Base.transaction` block at `CHANGE 2`, so a failure in either statement rolls back both writes.

**Explanation:** ActiveRecord's `update!` and `increment!` each issue their own `BEGIN`/`COMMIT` by default, making them independent database operations. If the process crashes or an exception is raised between the two calls, only the first write survives. Wrapping both in a single transaction makes them atomic: the database either commits both or rolls back both. This also means the pessimistic lock from Issue 1 is held across the entire operation, not just the read, which is necessary for the lock to protect the increment as well.
