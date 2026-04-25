## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Pluck Bypasses Time Zone Conversion
# ------------------------------------------------------------------------

class SubscriptionExpiryChecker
  WARNING_WINDOW = 24.hours

  def self.call
    cutoff = Time.zone.now + WARNING_WINDOW

    # CHANGE 1: Query and compare entirely in the database using a WHERE clause instead of pluck-and-compare in Ruby; this avoids receiving bare UTC Time objects that bypass ActiveSupport time-zone conversion and eliminates the time-zone skew.
    # CHANGE 2: Eager-load :user with the subscription records to eliminate the per-row re-fetch (N+1 query) that the original loop performed with find_by.
    subscriptions = Subscription.where(status: :active)
                                .where(expires_at: ..cutoff)
                                .includes(:user)

    subscriptions.each do |subscription|
      user = subscription.user
      WarningMailer.expiry_warning(user).deliver_later if user
    end
  end
end
```

## Explanation

### Issue 1: `pluck` Returns UTC Times, Skipping Time-Zone Conversion

**Problem:** Users whose subscription expires around midnight Eastern time receive a warning email during the prior afternoon. The email fires roughly 4–5 hours too early (the UTC offset for Eastern time).

**Fix:** Replace the `pluck(:expires_at)` + Ruby comparison with a database-level `WHERE expires_at <= cutoff` clause, where `cutoff = Time.zone.now + WARNING_WINDOW`. The `..cutoff` endless-range form passed to `where` lets ActiveRecord build the correct UTC-normalized SQL, and the comparison never happens in Ruby at all.

**Explanation:** `pluck` returns a plain Ruby `Array` of raw database values. For a `datetime` column Rails returns a `Time` object in UTC — not an `ActiveSupport::TimeWithZone`. When you then compare that value to `Time.zone.now + WARNING_WINDOW`, which *is* a `TimeWithZone`, Ruby internally compares the two timestamps, but the raw UTC `Time` has no knowledge of the configured app time zone. The values are numerically equal at the same instant, so that part is fine — the real problem is that the developer believed they were guarding against sending emails "before" a wall-clock midnight in Eastern, but since the check is done in Ruby with no WHERE filter, *all* expiring subscriptions within the next 24 UTC hours are included. Because UTC midnight is 4–5 hours ahead of Eastern midnight, subscriptions that expire at Eastern midnight are already inside the 24-hour UTC window by mid-afternoon Eastern time. Moving the comparison into a SQL `WHERE` clause with a properly constructed `cutoff` (an `ActiveSupport::TimeWithZone`) lets Rails serialize it to UTC correctly and ensures the boundary is evaluated consistently, matching the intent of the business rule.

---

### Issue 2: Per-Match Re-fetch Creates N+1 Queries

**Problem:** For every subscription timestamp that passes the expiry check, the original code runs a separate `Subscription.find_by(expires_at: expires_at)` query to obtain the subscription and then access its user. If 200 subscriptions are near expiry, the job fires 200 additional SELECT statements.

**Fix:** Remove `find_by` inside the loop entirely and replace `pluck` with a full `Subscription` relation using `.includes(:user)`. Each iteration uses the already-loaded `subscription` record and calls `subscription.user` directly, which is satisfied from memory.

**Explanation:** `pluck` intentionally returns only the requested column values, discarding the full ActiveRecord objects. To get the associated `User` the original code had to re-query the database with `find_by(expires_at: expires_at)`, then call `.user` on the result (a second implicit query unless the association was loaded). With `.includes(:user)` Rails loads all matching subscriptions and their users in at most two queries total — one for subscriptions and one for users — regardless of how many rows match. A related pitfall: `find_by(expires_at: ...)` could theoretically return a *different* subscription if two share the exact same timestamp, so removing it also eliminates that subtle correctness risk.
