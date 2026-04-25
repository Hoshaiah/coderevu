## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Uniqueness Validation Without DB Index
# ------------------------------------------------------------------------

class Invite < ApplicationRecord
  # CHANGE 3: moved token generation to before_validation so the uniqueness validator sees the token value on new records.
  before_validation :generate_token, on: :create
  validates :token, uniqueness: true
  validates :email, presence: true

  def generate_token
    self.token = SecureRandom.hex(24)
  end
end

# db/migrate/20240101000000_create_invites.rb
class CreateInvites < ActiveRecord::Migration[7.1]
  def change
    create_table :invites do |t|
      t.string :email, null: false
      t.string :token
      t.integer :account_id
      t.timestamps
    end
    # CHANGE 2: add a unique index so the database itself rejects duplicate tokens regardless of what Rails does.
    add_index :invites, :token, unique: true
  end
end

# CHANGE 1: wrap concurrent invite creation in a rescue block that handles the unique-constraint violation the DB now raises, making the race condition safe. In the batch job or service object that calls Invite.create!, rescue ActiveRecord::RecordNotUnique and retry or skip as appropriate: begin Invite.create!(email: email) rescue ActiveRecord::RecordNotUnique retry  # regenerate token and try again end
```

## Explanation

### Issue 1: Race Condition in Uniqueness Check

**Problem:** Under concurrent load, two Sidekiq workers can both call `Invite.create!` at nearly the same time. Each runs the ActiveRecord uniqueness validator, which issues a `SELECT` to check whether the token already exists. Both selects return zero rows, both workers proceed, and both `INSERT` statements succeed — producing two rows with the same token.

**Fix:** At the CHANGE 1 site, callers that create invites concurrently rescue `ActiveRecord::RecordNotUnique` (the exception the DB raises when the unique index introduced in CHANGE 2 catches a duplicate) and retry. This is the only reliable way to handle the race window between the SELECT and the INSERT.

**Explanation:** ActiveRecord's `validates :token, uniqueness: true` is not atomic. It runs a `SELECT COUNT(*) WHERE token = ?` and, if zero rows come back, allows the save to proceed. Between that SELECT and the subsequent INSERT, another thread can run the same SELECT and also see zero rows. Both then INSERT successfully. No amount of tuning the Rails validator alone closes this window because the check and the write are separate round trips. The database unique index collapses the check and the enforcement into a single atomic operation: the INSERT either succeeds or raises a constraint error. Rescuing `ActiveRecord::RecordNotUnique` and retrying lets the application handle that error gracefully instead of crashing.

---

### Issue 2: No Unique Database Index on `token`

**Problem:** The migration creates the `invites` table but never adds a unique index on `token`. The database applies no constraint, so any two rows may share a token. When that happens, both invite recipients can use the same magic link and one gains access to the wrong account.

**Fix:** At the CHANGE 2 site, `add_index :invites, :token, unique: true` is added to the migration (or a separate migration can be created for existing tables). This instructs the database engine to enforce uniqueness at the storage level.

**Explanation:** A Rails uniqueness validator is an application-level check. It has no awareness of what other database connections are doing at the same moment. The unique index is a database-level constraint that every connection — Rails, a Rails console session, a direct SQL script, a Sidekiq worker — must pass through. If two INSERTs race, the database serializes them and the second one receives a constraint violation error. Without the index, the validator provides only a best-effort check that passes under concurrent load. Adding the index also improves query performance for any lookup by token, such as the one the invitation acceptance controller performs.

---

### Issue 3: Token Generated After Validation Runs

**Problem:** `before_create :generate_token` fires after validations complete on a new record. When `validates :token, uniqueness: true` runs, `token` is still `nil`. The validator checks whether `nil` is unique (it typically passes or behaves inconsistently depending on the DB null handling), and the token is only set immediately before the INSERT. This means validation does not actually check the real token value.

**Fix:** At the CHANGE 3 site, the callback is changed to `before_validation :generate_token, on: :create`. This ensures `generate_token` populates `self.token` before any validator sees the record, so the uniqueness check runs against the actual token string.

**Explanation:** ActiveRecord's callback order is: `before_validation` → validations → `before_create` → INSERT. In the original code, `token` is `nil` during the uniqueness SELECT, so the validator is checking the wrong value. Moving token generation to `before_validation` means the token exists by the time the uniqueness validator fires, so the SELECT checks the real token. The `on: :create` scope prevents the callback from overwriting an existing token on updates, which would break edits to other fields on an already-persisted invite.
