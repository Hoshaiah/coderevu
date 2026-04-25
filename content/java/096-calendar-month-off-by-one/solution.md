## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — java.util.Calendar month is zero-indexed, causing date comparisons to be off by one month
// ------------------------------------------------------------------------
import java.util.Calendar;
import java.util.Date;

public class TrialExpiryChecker {

    public boolean isExpired(int year, int month, int day) {
        Calendar expiry = Calendar.getInstance();
        // CHANGE 1: subtract 1 from month because Calendar months are zero-indexed (January=0, December=11), so a stored month of 1 must become 0, etc.
        expiry.set(year, month - 1, day, 0, 0, 0);
        expiry.set(Calendar.MILLISECOND, 0);

        Calendar now = Calendar.getInstance();
        // CHANGE 2: clear sub-day fields on 'now' so a trial expiring today is treated as expired regardless of the exact time the job runs.
        now.set(Calendar.HOUR_OF_DAY, 0);
        now.set(Calendar.MINUTE, 0);
        now.set(Calendar.SECOND, 0);
        now.set(Calendar.MILLISECOND, 0);
        return !now.before(expiry);
    }
}
```

## Explanation

### Issue 1: Calendar month is zero-indexed

**Problem:** `Calendar.set()` treats months as zero-indexed (0 = January, 11 = December). When stored month integers run 1–12, passing them directly shifts every expiry date one month into the future. A trial that should expire on 2024-01-31 is instead set to 2024-02-29, so the customer is billed a full month late.

**Fix:** Replace `month` with `month - 1` in the `expiry.set(year, month, day, 0, 0, 0)` call. This maps the human-readable 1-based month to the 0-based value `Calendar` expects.

**Explanation:** `java.util.Calendar` was designed with a constant-based API where `Calendar.JANUARY == 0`. When you pass a raw integer like `3` for March, `Calendar` interprets it as April (index 3). Subtracting 1 before the call aligns the two numbering schemes. The December edge case the team noticed works by coincidence: month 12 becomes index 12, which `Calendar` rolls over to January of the next year, accidentally matching the correct next-billing behavior for that specific month. Using `java.time.LocalDate` (available since Java 8) avoids this entirely because its month values are 1-based.

---

### Issue 2: `now` retains current time-of-day, making same-day comparisons inconsistent

**Problem:** `Calendar.getInstance()` initializes `now` with the exact wall-clock time including hours, minutes, seconds, and milliseconds. If the billing job runs at 14:30 and the expiry date is today at midnight, `now` is after `expiry` and the check works. But if the job runs at 00:01 and the expiry fields are set to 00:00:00.000, a race condition means the result depends on job scheduling, not business logic.

**Fix:** After constructing `now`, zero out its `HOUR_OF_DAY`, `MINUTE`, `SECOND`, and `MILLISECOND` fields, mirroring what is already done for `expiry`. This makes the comparison date-only.

**Explanation:** `expiry` is explicitly set to midnight (`0, 0, 0` for hour/minute/second and `MILLISECOND` cleared), so it always represents the very start of the expiry day. `now` has no such normalization, so it floats throughout the day. The check `!now.before(expiry)` returns `true` (expired) only once the clock passes the expiry instant, meaning a trial could appear unexpired for up to 24 hours after the expiry date begins. Zeroing the time fields on `now` makes the comparison fire reliably at the day boundary regardless of when the billing job is scheduled.
