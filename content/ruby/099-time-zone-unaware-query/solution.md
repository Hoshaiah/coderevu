## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Daily report counts orders from the wrong day near midnight in non-UTC deployments
# ------------------------------------------------------------------------
# app/jobs/daily_order_report_job.rb
class DailyOrderReportJob < ApplicationJob
  queue_as :default

  # CHANGE 2: Use Time.current.in_time_zone.to_date instead of Date.today so the default date reflects the app's configured timezone, not UTC.
  def perform(date = Time.current.in_time_zone.to_date)
    # CHANGE 1: Use beginning_of_day / end_of_day on a time-zone-aware object so the range boundaries are computed in Eastern Time, not UTC.
    start_time = date.beginning_of_day
    end_time   = date.end_of_day

    count = Order
      .where(created_at: start_time...end_time)
      .count

    ReportMailer.daily_summary(date: date, count: count).deliver_now
  end
end
```

## Explanation

### Issue 1: Timezone-naive midnight boundaries

**Problem:** Orders placed between midnight and ~5 AM Eastern show up in both yesterday's and today's reports, and orders in the final hour of the day sometimes disappear entirely. The count window is shifted by the UTC offset (5 hours in EST, 4 in EDT) relative to what ops expects.

**Fix:** Replace `date.to_time` with `date.beginning_of_day` and `(date + 1).to_time` with `date.end_of_day`. Both methods on an `ActiveSupport::TimeWithZone`-aware `Date` return timestamps anchored to midnight in the app's configured timezone (`Eastern Time (US & Canada)`).

**Explanation:** `Date#to_time` in Ruby returns a `Time` object in the process's system timezone, which on most servers is UTC. When the app's `config.time_zone` is Eastern, midnight Eastern is 05:00 UTC, so the query window `00:00 UTC...00:00 UTC+1day` covers entirely the wrong slice of the database's UTC `created_at` column. `ActiveSupport`'s `Date#beginning_of_day` is aware of `Time.zone` and emits the correct UTC-equivalent of midnight in that zone. A related pitfall: if you call `Time.zone.parse(date.to_s)` instead, you get the same correct result, but `beginning_of_day` / `end_of_day` are idiomatic Rails and harder to misuse.

---

### Issue 2: Default date evaluated in UTC

**Problem:** When the job runs just after midnight Eastern (e.g., 00:30 ET = 05:30 UTC), `Date.today` returns the UTC date, which is already the next calendar day. The report for "today" therefore covers the wrong 24-hour window from the start.

**Fix:** Replace the default argument `Date.today` with `Time.current.in_time_zone.to_date`. `Time.current` returns the current time in `Time.zone` (Eastern), and `.to_date` extracts the local calendar date.

**Explanation:** `Date.today` delegates to Ruby's `Date` class, which uses the OS clock with no timezone awareness — on a UTC server it always returns the UTC calendar date. Between midnight and the UTC offset (up to 5 hours Eastern), that date is one day ahead of the Eastern date. `Time.current` is Rails' equivalent of `Time.now` but respects `Time.zone`, so `.to_date` on it gives the date an Eastern-timezone user would read on their wall clock. This is particularly important for scheduled jobs that fire at a time like `06:00 UTC` thinking they represent the prior Eastern day.
