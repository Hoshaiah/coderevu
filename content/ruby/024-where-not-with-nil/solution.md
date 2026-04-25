## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — WHERE NOT Misses NULL Rows
# ------------------------------------------------------------------------

class User < ApplicationRecord
  # Intended: all users who are NOT internal staff.
  # This should include users where internal is false OR null.
  # CHANGE 1: Replace where.not(internal: true) with an explicit OR condition that handles NULL — SQL NULL comparisons never match != so we must use IS NULL or OR explicitly.
  scope :external, -> { where(internal: [false, nil]) }
end

# In the admin controller:
class Admin::UsersController < ApplicationController
  def index
    @users = User.external.order(:created_at)
    # Users with internal = NULL are now correctly included in results.
  end
end
```

## Explanation

### Issue 1: SQL NULL Exclusion in WHERE NOT

**Problem:** The scope `where.not(internal: true)` generates SQL like `WHERE internal != TRUE`. In SQL, any comparison involving NULL produces UNKNOWN rather than TRUE or FALSE, so rows where `internal IS NULL` are silently dropped from the result set. Admin dashboard user counts are lower than the real external-user count by however many un-backfilled rows exist.

**Fix:** Replace `where.not(internal: true)` with `where(internal: [false, nil])`. ActiveRecord translates an array containing `nil` into `WHERE (internal = FALSE OR internal IS NULL)`, which correctly captures both cases.

**Explanation:** SQL's three-valued logic means `NULL != TRUE` evaluates to UNKNOWN, and the database excludes UNKNOWN rows from a WHERE clause just as it excludes FALSE rows. ActiveRecord's `where.not` does not add an `IS NULL` check automatically — it only negates the equality condition. Passing `[false, nil]` to `where` makes ActiveRecord emit the explicit `IS NULL` branch, so rows that were never backfilled after the column was added are matched. A related pitfall: `where.not(internal: [true])` has the same problem — whenever you negate a condition that could involve NULL, prefer an explicit inclusive condition over a negation.

---

### Issue 2: Missing Column Default Allows Future NULL Rows

**Problem:** The `internal` column has no NOT NULL constraint and no database-level default, so any code path that creates a user without explicitly setting `internal` will produce a NULL row. This means the bug can recur for newly created users even after the scope is fixed.

**Fix:** Add a migration that sets a column default and backfills existing NULLs, for example `change_column_default :users, :internal, false` followed by `User.where(internal: nil).update_all(internal: false)`. This closes the gap at the data layer rather than relying solely on query logic to handle NULL.

**Explanation:** Without a default, Rails inserts NULL whenever `internal` is omitted from the attributes hash during record creation. Fixing the scope handles the symptom, but the root cause is that the schema permits a state — NULL — that the business logic does not intend. Setting a NOT NULL default at the database level means the column can only ever be TRUE or FALSE going forward. The backfill ensures existing rows are consistent, so future queries that use straightforward boolean conditions work correctly without needing the `nil` branch at all.
