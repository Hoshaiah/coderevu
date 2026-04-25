## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Concurrent sign-ups create duplicate user accounts for the same email address
# ------------------------------------------------------------------------
# db/migrate/20240101000000_create_users.rb
class CreateUsers < ActiveRecord::Migration[7.1]
  def change
    create_table :users do |t|
      t.string :email, null: false
      t.string :password_digest, null: false
      t.boolean :admin, default: false
      t.timestamps
    end

    # CHANGE 1: Add a unique index on the lowercased email so the database enforces uniqueness atomically, closing the race-condition window that exists when only ActiveRecord validates uniqueness in Ruby.
    add_index :users, 'LOWER(email)', unique: true, name: 'index_users_on_lower_email'
  end
end

# app/models/user.rb
class User < ApplicationRecord
  has_secure_password

  # CHANGE 2: Normalize email to lowercase before validation and persistence so the expression index above is always hit and comparisons are consistent.
  before_save :normalize_email

  validates :email,
    presence: true,
    uniqueness: { case_sensitive: false },
    format: { with: URI::MailTo::EMAIL_REGEXP }

  private

  def normalize_email
    self.email = email.downcase
  end
end
```

## Explanation

### Issue 1: Missing database-level unique index

**Problem:** Two concurrent sign-up requests both read the `users` table, find no matching email, pass the Rails `validates :email, uniqueness:` check, and then both INSERT a row. The support team sees two accounts with the same email address.

**Fix:** Add `add_index :users, 'LOWER(email)', unique: true` in the migration. The database now enforces uniqueness at commit time using an atomic constraint, so the second INSERT raises `ActiveRecord::RecordNotUnique` and rolls back.

**Explanation:** Rails' `uniqueness` validator works by running a `SELECT` query before saving. Between that `SELECT` and the subsequent `INSERT`, another transaction can run its own `SELECT`, also find nothing, and proceed to INSERT. The database sees both INSERTs as independent operations and accepts both. A `UNIQUE` index moves the enforcement inside the database engine itself: only one INSERT can hold the index lock for a given key value at a time, and the second one fails with a constraint violation. The expression index on `LOWER(email)` is used here (instead of a plain column index) to align with the case-insensitive uniqueness requirement described in Issue 2. In production you should rescue `ActiveRecord::RecordNotUnique` in the controller or rely on `rescue_from` to return a sensible error to the user rather than a 500.

---

### Issue 2: Email case not normalized before persistence

**Problem:** The Rails validator uses `case_sensitive: false`, but it compares against whatever string is stored. If 'Alice@Example.com' is already in the database and 'alice@example.com' signs up, the validator may catch it, but the expression index on `LOWER(email)` will always catch it only if the stored value itself is not already lowercased — meaning a plain column unique index would miss the duplicate. More practically, without normalization two users can log in with different capitalizations and reach different accounts.

**Fix:** Add `before_save :normalize_email` with `self.email = email.downcase`. This ensures the value written to the database is always lowercase, making the `LOWER(email)` expression index effective and keeping login lookups consistent.

**Explanation:** A `UNIQUE` index on the raw `email` column treats 'Alice@Example.com' and 'alice@example.com' as different strings in most databases (PostgreSQL's default collation is case-sensitive). Using an expression index on `LOWER(email)` tells the database to index the lowercased form, so the constraint fires regardless of the casing the user typed. But that only works reliably if the stored value is also lowercased, because the index is computed from the stored value at write time. The `before_save` callback runs before both `create` and `update`, so re-registrations and email-change flows are covered. Using `before_validation` instead of `before_save` is an equally valid choice and has the advantage of normalizing before the format validator runs, avoiding a mismatch if the regex is case-sensitive.
