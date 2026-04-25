## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Batched Find Ignores Custom Order
# ------------------------------------------------------------------------

class InvoiceGenerationJob < ApplicationJob
  queue_as :billing

  def perform(billing_period)
    # CHANGE 1: Replace find_each with in_batches so the custom created_at order is preserved; find_each ignores any .order() and always sorts by primary key.
    Subscription
      .active
      .order(:created_at)
      .in_batches(batch_size: 500) do |batch|
        # CHANGE 2: Call each on the yielded relation so individual subscription records are iterated while the batch-level ORDER BY created_at is respected.
        batch.each do |subscription|
          InvoiceService.generate(subscription, billing_period)
        end
      end
  end
end
```

## Explanation

### Issue 1: `find_each` Overrides Custom Order

**Problem:** Invoices are generated in `id` (primary key) order regardless of the `.order(:created_at)` call. The billing team sees newer customers processed before older ones, violating the processing-priority requirement.

**Fix:** Replace `find_each` with `in_batches`, then call `.each` on the yielded `ActiveRecord::Relation` batch. This is shown at CHANGE 1 and CHANGE 2 in the reference solution.

**Explanation:** `find_each` is implemented by iterating over pages using `WHERE id > last_seen_id ORDER BY id ASC`. To do that cursor-based pagination correctly, Rails internally strips any existing `ORDER BY` clause and replaces it with `ORDER BY primary_key ASC`. The `.order(:created_at)` you wrote is present in the relation object but gets discarded before the SQL is executed. The Postgres `EXPLAIN` still shows the `ORDER BY created_at` you wrote because Rails logs the relation before it rewrites the query, which misled the DBA. `in_batches` yields an `ActiveRecord::Relation` for each page and does not forcibly reorder it, so the `ORDER BY created_at` you declared survives into the actual SQL. Calling `.each` on that batch relation then iterates the already-ordered rows. One pitfall: if `created_at` values are not unique (multiple subscriptions created in the same second), batch boundaries can cause rows to be skipped or duplicated; adding a secondary sort on `id` (`.order(:created_at, :id)`) eliminates that edge case in production.

---

### Issue 2: No Opt-In for Non-Primary-Key Batching

**Problem:** Rails 7 does not raise an error or warning when you chain `.order()` before `find_each`; it silently discards the order. A developer reading the code sees `.order(:created_at).find_each` and reasonably expects the ordering to be honored, but the actual database queries use `id` ordering.

**Fix:** The switch to `in_batches` at CHANGE 1 is the opt-in mechanism. `in_batches` does not rewrite the `ORDER BY`, so the query that hits Postgres includes `ORDER BY created_at ASC` as intended.

**Explanation:** `find_each` relies on a keyset-pagination technique (tracking the last `id` seen) that only works correctly when the sort column is the primary key. Because any other ordering would break the cursor logic, Rails unconditionally replaces the order — there is no way to pass a custom ordering through `find_each`. `in_batches` uses `LIMIT/OFFSET`-style batching by default when you supply a non-id order, which does allow the custom `ORDER BY` to survive. The trade-off is that `LIMIT/OFFSET` gets slower on very large offsets; for hundreds of thousands of subscriptions this is usually acceptable, but teams with tens of millions of rows should consider a cursor-based approach using a unique ordered column instead.
