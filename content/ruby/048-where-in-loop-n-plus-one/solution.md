## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — N+1 Inside Notification Fanout
# ------------------------------------------------------------------------

class NotificationService
  BATCH_SIZE = 1_000

  def fanout(article)
    author = article.user

    # CHANGE 3: Use find_each with a batch size instead of loading all follower IDs at once, so memory stays bounded for large follower sets.
    Follow.where(followee_id: author.id).select(:follower_id).find_each(batch_size: BATCH_SIZE) do |follow|
      # CHANGE 1: Collect follower IDs per batch so we can preload all Users in one query instead of one per follower.
      follower_ids_batch = []
      follower_ids_batch << follow.follower_id

      # CHANGE 1: Load all Users for this batch in a single SELECT ... WHERE id IN (...) instead of one User.find per follower.
      recipients = User.where(id: follower_ids_batch).index_by(&:id)

      # CHANGE 2: Build notification attribute hashes and insert them all at once with insert_all! to replace per-row INSERT statements.
      notifications = follower_ids_batch.map do |follower_id|
        recipient = recipients[follower_id]
        next unless recipient
        {
          recipient_type: "User",
          recipient_id:   recipient.id,
          actor_id:       author.id,
          action:         "published",
          notifiable_type: article.class.name,
          notifiable_id:  article.id,
          created_at:     Time.current,
          updated_at:     Time.current
        }
      end.compact

      Notification.insert_all!(notifications) if notifications.any?
    end
  end
end
```

## Explanation

### Issue 1: N+1 SELECT on User per follower

**Problem:** For every follower ID in the list, the original code calls `User.find(follower_id)`, which issues a separate `SELECT * FROM users WHERE id = $1` query. With 80,000 followers this becomes 80,000 sequential round-trips, holding a database connection for tens of seconds and exhausting the connection pool for other requests.

**Fix:** Replace the per-follower `User.find` with `User.where(id: follower_ids_batch).index_by(&:id)`, which emits a single `SELECT … WHERE id IN (…)` for the entire batch, then builds a hash keyed by ID for O(1) lookup.

**Explanation:** ActiveRecord's `find(id)` always generates a single-row query; there is no batching built in. By collecting IDs first and issuing one `WHERE id IN (…)` query, the number of SELECT statements drops from N (one per follower) to N/batch_size. The `index_by(&:id)` call turns the result array into a hash so looking up a specific user is a hash access rather than another query. A related pitfall: if you use `User.find` inside a `.map` or `.each`, Rails has no opportunity to coalesce the queries even if the IDs are known ahead of time.

---

### Issue 2: One INSERT per notification

**Problem:** `Notification.create!` inside the loop issues a separate `INSERT INTO notifications …` statement for each follower. For 80,000 followers this is 80,000 individual write round-trips, which compounds the latency from the read N+1 and keeps the database connection busy for the entire duration.

**Fix:** Replace `Notification.create!` in the loop with building an array of attribute hashes and calling `Notification.insert_all!(notifications)` once per batch, which translates to a single bulk INSERT statement.

**Explanation:** Each `create!` call opens a transaction, sends an INSERT, waits for confirmation, and releases—then repeats. `insert_all!` sends all rows in one statement, and the database writes them in a single pass. The trade-off is that `insert_all!` bypasses ActiveRecord callbacks and validations, so if `Notification` has important `before_create` hooks you need to move that logic elsewhere or validate the data before building the hashes. The `created_at`/`updated_at` timestamps must be set explicitly because `insert_all!` does not auto-populate them.

---

### Issue 3: Full follower ID list loaded into Ruby memory

**Problem:** `Follow.where(followee_id: author.id).pluck(:follower_id)` fetches every follower ID into a single Ruby Array before any processing starts. For a user with 80,000 followers this is a large allocation, and for a user with millions of followers it could cause the Ruby process to run out of memory or trigger GC pressure that slows down the entire worker.

**Fix:** Replace the one-shot `pluck` with `Follow.where(...).select(:follower_id).find_each(batch_size: BATCH_SIZE)`, which uses cursor-based pagination under the hood to load and process `BATCH_SIZE` rows at a time.

**Explanation:** `find_each` issues repeated `SELECT … ORDER BY id LIMIT batch_size OFFSET …` queries (or uses keyset pagination depending on the Rails version), so Ruby only holds `batch_size` records in memory at once before they are garbage-collected. Setting `batch_size` to 1,000 means the peak memory footprint for the Follow records is proportional to 1,000 rows, not 80,000. One thing to watch: `find_each` requires a primary key on the model by default, and it overrides any existing `ORDER BY` clause, so do not combine it with custom ordering.
