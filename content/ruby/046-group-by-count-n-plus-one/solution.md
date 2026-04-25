## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — N+1 Inside a Group-By Report
# ------------------------------------------------------------------------

module Billing
  class InvoiceSummary
    def self.generate
      counts = Invoice
        .where(status: "issued")
        .group(:account_id)
        .count

      account_ids = counts.keys

      # CHANGE 1: Load all accounts in one query instead of calling Account.find inside the loop, eliminating one SELECT per account.
      # CHANGE 2: Eagerly load :owner association via includes so all owners are fetched in a single follow-up query rather than one per account.
      accounts_by_id = Account
        .where(id: account_ids)
        .includes(:owner)
        .index_by(&:id)

      counts.map do |account_id, invoice_count|
        account = accounts_by_id[account_id]
        owner   = account.owner

        {
          account_id: account_id,
          owner_name: owner.full_name,
          invoice_count: invoice_count
        }
      end
    end
  end
end
```

## Explanation

### Issue 1: Per-account SELECT in loop

**Problem:** Inside the `counts.map` block, `Account.find(account_id)` runs a `SELECT * FROM accounts WHERE id = ?` for every entry in `counts`. With thousands of accounts, this floods the database with thousands of single-row reads and causes the job to time out.

**Fix:** Before the loop, collect all account IDs from `counts.keys` and call `Account.where(id: account_ids).includes(:owner).index_by(&:id)`. This replaces the per-iteration `Account.find` call with a single batch query, and the result is stored in a hash keyed by ID for O(1) lookup inside the loop.

**Explanation:** `Account.find` is designed for single-record lookup; it always issues its own SQL statement immediately. Calling it inside a loop means ActiveRecord can never batch the work — each iteration triggers a round-trip to the database. Pulling all the IDs out first and using `WHERE id IN (...)` lets the database return all rows at once. The `index_by(&:id)` call turns the resulting array into a hash so the loop body still reads `accounts_by_id[account_id]` at constant time rather than doing a linear search.

---

### Issue 2: Per-account owner SELECT via association

**Problem:** Even after fixing the Account query, calling `account.owner` on each iteration would still fire a `SELECT * FROM users WHERE account_id = ?` for every account because the `owner` association is not pre-loaded. The slow-query alert's flood of user lookups comes from exactly this pattern.

**Fix:** `.includes(:owner)` is added to the batch Account query at the `CHANGE 2` site. ActiveRecord then fetches all associated `User` records in a second query (`SELECT * FROM users WHERE account_id IN (...)`) and caches them on the in-memory Account objects, so `account.owner` in the loop hits the cache instead of the database.

**Explanation:** ActiveRecord's `has_one` and `has_many` associations are lazy by default: the SQL runs the first time you read the association on a given object. When you load accounts one at a time with `find`, each object has a cold cache, so every `.owner` call fires a query. `includes` tells ActiveRecord to resolve the association for the whole collection up front. A related pitfall: if you later add a `.where` scope on the association (e.g. `account.owner.active`) that breaks the preload cache and re-queries, so keep the association access simple after using `includes`.
