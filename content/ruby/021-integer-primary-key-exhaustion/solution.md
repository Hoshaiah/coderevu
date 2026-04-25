## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Integer Primary Key Nears Limit
# ------------------------------------------------------------------------

# db/migrate/20190314_create_events.rb
class CreateEvents < ActiveRecord::Migration[5.2]
  def change
    # CHANGE 1: Use `id: :bigint` to give the primary key a signed 64-bit sequence (max ~9.2 quintillion) instead of the default 32-bit integer (max ~2.1 billion), preventing the 'integer out of range' overflow that took down the API.
    create_table :events, id: :bigint do |t|
      t.string  :event_type,  null: false
      # CHANGE 2: Use `t.bigint` instead of `t.integer` for user_id so it can hold foreign-key values from a bigint users primary key and won't overflow under sustained high-volume ingestion.
      t.bigint  :user_id
      t.jsonb   :payload,     default: {}
      t.timestamps
    end

    add_index :events, :event_type
    add_index :events, :user_id
    add_index :events, :created_at
    # CHANGE 3: Add a composite index on [:event_type, :created_at] so analytics queries that filter by event type within a time range can satisfy both predicates from a single index scan rather than intersecting two separate indexes.
    add_index :events, [:event_type, :created_at]
  end
end
```

## Explanation

### Issue 1: Integer Primary Key Overflow

**Problem:** The `events` table was created with Rails' default primary key, which is a signed 32-bit integer. Its maximum value is 2,147,483,647. At 2 million inserts per day the sequence exhausted that ceiling after roughly three years, and every subsequent insert attempt raised `ERROR: integer out of range`, returning HTTP 500 to all API callers.

**Fix:** Pass `id: :bigint` to `create_table` so Rails generates the primary key column as a signed 64-bit integer with a `bigserial` sequence, raising the ceiling to approximately 9.2 × 10¹⁸ rows.

**Explanation:** PostgreSQL's `serial` type (used by Rails' default integer primary key) maps to a 32-bit signed integer sequence. Once the sequence hits 2,147,483,647, the next `nextval()` call raises an overflow error rather than wrapping around, so no new rows can be inserted at all. A `bigserial` sequence uses 64 bits, giving a ceiling that is effectively unreachable at any realistic insertion rate. The fix must be applied at table-creation time — retrofitting an existing table requires an `ALTER TABLE … ALTER COLUMN` that rewrites every row and blocks writes for hours, exactly the multi-hour incident described in the context. The lesson: always use `bigint` primary keys for any table expected to receive sustained high-volume writes.

---

### Issue 2: user_id Column Uses 4-Byte Integer

**Problem:** `t.integer :user_id` creates a 4-byte signed integer column. If the `users` table already uses or later migrates to a `bigint` primary key, inserting a user ID above 2,147,483,647 into `events.user_id` raises the same overflow error. Even if users never reach that scale, the type mismatch between a `bigint` foreign key and an `integer` column prevents PostgreSQL from adding a proper foreign-key constraint without an implicit cast.

**Fix:** Replace `t.integer :user_id` with `t.bigint :user_id`, producing an 8-byte column that matches a `bigint` primary key on the `users` table.

**Explanation:** Rails generates `bigint` primary keys by default starting in Rails 5.1 (when the `ActiveRecord::ConnectionAdapters::PostgreSQLAdapter` default was changed), meaning `users.id` is likely already a `bigint`. Storing a `bigint` value in an `integer` foreign-key column silently truncates or errors depending on the value. Using `t.bigint` keeps the types consistent, allows a proper `FOREIGN KEY` constraint, and avoids a second painful `ALTER TABLE` later. The storage cost difference — 4 bytes versus 8 bytes per row — is negligible relative to the `jsonb` payload column already on the table.

---

### Issue 3: Missing Composite Index for Time-Range Analytics Queries

**Problem:** Analytics pipelines almost always query events by type within a time window (e.g., `WHERE event_type = 'purchase' AND created_at > '2024-01-01'`). With only separate single-column indexes on `event_type` and `created_at`, PostgreSQL must choose one index and then filter the other predicate in memory, or perform a bitmap index intersection — both are expensive on a 2-billion-row table under high read load.

**Fix:** Add `add_index :events, [:event_type, :created_at]` as a composite index so the query planner can satisfy both the equality and range predicates in a single ordered index scan.

**Explanation:** A composite index on `(event_type, created_at)` stores rows sorted first by `event_type` and then by `created_at` within each type. A query with `WHERE event_type = 'purchase' AND created_at > ?` jumps directly to the `purchase` section of the index and then scans forward chronologically, touching only relevant index pages. Without this index, the planner often falls back to a sequential scan or an expensive bitmap heap fetch on a table of this size. The leading column should be the high-cardinality equality predicate (`event_type`) and the trailing column the range predicate (`created_at`) — reversing the order would prevent the range scan optimization. This index also supports `ORDER BY created_at` within a given `event_type` without an additional sort step.
