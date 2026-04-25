## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Scheduled jobs run at the wrong time for users outside UTC
# ------------------------------------------------------------------------
class DigestScheduler
  def self.run
    # CHANGE 1: Convert UTC wall-clock time into each user's local time zone before comparing, so DST offsets are honoured automatically. We iterate over every distinct time zone stored in the DB instead of hard-coding one zone (CHANGE 2), then convert `now` into that zone and compare the local hour/minute.

    now_utc = Time.now.utc

    # CHANGE 2: Query all distinct time zones present in the users table rather than hard-coding 'Europe/London', so users in any zone are scheduled correctly.
    time_zones = User.distinct.pluck(:time_zone)

    time_zones.each do |tz|
      # CHANGE 1: Use ActiveSupport::TimeZone to convert UTC now into the user's local time, which correctly applies the current DST offset.
      local_now = now_utc.in_time_zone(tz)

      due_users = User.where(
        "scheduled_hour = ? AND scheduled_minute = ? AND time_zone = ?",
        local_now.hour,
        local_now.min,
        tz
      )

      due_users.find_each do |user|
        DigestMailer.weekly(user).deliver_later
      end
    end
  end
end
```

## Explanation

### Issue 1: DST offset ignored in time comparison

**Problem:** During British Summer Time (late March through late October) London clocks are UTC+1, so 09:00 local time corresponds to 08:00 UTC. The original code reads the server's UTC hour (8) and matches it against `scheduled_hour`, but the user stored 9 in that column. The digest fires an hour late — or not at all, because the scheduler may have already passed minute 0 of the hour by the time BST kicks in.

**Fix:** Replace `Time.now` (raw UTC wall clock) with `now_utc.in_time_zone(tz)`, which returns an `ActiveSupport::TimeWithZone` whose `hour` and `min` reflect the user's actual local time including any DST offset. This is the `local_now` variable introduced at the CHANGE 1 sites.

**Explanation:** Ruby's `Time.now` on a UTC server returns UTC integers for `hour` and `min`. Comparing those directly against values the user chose in their own time zone only works when that zone has a zero UTC offset — i.e., Europe/London in winter. The moment the UK switches to BST (+01:00), the offsets diverge by 60 minutes and the comparison fails. `in_time_zone` delegates to ActiveSupport's `TZInfo`-backed zone data, which knows the exact DST transition moment and adjusts accordingly. A related pitfall: zones like `America/New_York` alternate between UTC-5 and UTC-4, so the same bug would cause a one-hour drift for half the year there too.

---

### Issue 2: Hard-coded time zone excludes all other users

**Problem:** The `WHERE time_zone = 'Europe/London'` predicate means users who stored any other zone — `America/New_York`, `Asia/Tokyo`, etc. — are never returned by the query. Their digests simply never send, with no error or log message.

**Fix:** Replace the single hard-coded string with a loop over `User.distinct.pluck(:time_zone)` (CHANGE 2). For each zone, convert `now_utc` into local time and run the existing query filtered to that zone, so every user gets evaluated against their own local clock.

**Explanation:** The original code was written and tested only for a UK audience, so the hard-coded zone worked for the initial launch. When the product expanded, every new user's `time_zone` column was populated with their real zone, but the scheduler never queried for them. `distinct.pluck(:time_zone)` retrieves exactly the set of zones that exist in the database — one cheap query — and the loop then issues one targeted SELECT per zone. This keeps each query selective (it can use an index on `time_zone`) while covering all users.
