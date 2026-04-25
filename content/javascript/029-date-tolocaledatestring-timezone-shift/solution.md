## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Date Shifted by UTC Offset
// ------------------------------------------------------------------------

export function formatReservationDate(isoDateString: string): string {
  // isoDateString is a date-only string, e.g. "2024-07-15"
  // CHANGE 1: Parse the date components manually instead of passing the ISO string directly to `new Date()`, which would interpret it as UTC midnight and shift the date backward for UTC-negative timezones.
  const [year, month, day] = isoDateString.split('-').map(Number);
  // CHANGE 2: Construct the Date using the local-time constructor overload so the calendar date matches the string in every timezone, then format with `timeZone: 'UTC'` is unnecessary because local noon is unambiguous.
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
```

## Explanation

### Issue 1: Date-only string parsed as UTC midnight

**Problem:** Users in UTC-4 through UTC-12 see their reservation date shifted one day earlier than booked. A reservation for July 15 displays as July 14.

**Fix:** Replace `new Date(isoDateString)` with manual extraction of `year`, `month`, and `day` via `isoDateString.split('-').map(Number)`, then pass those parts to the `Date` local-time constructor `new Date(year, month - 1, day, 12, 0, 0)`.

**Explanation:** The ECMAScript spec says that when `new Date()` receives a date-only ISO 8601 string (no time component), it parses it as UTC midnight — `2024-07-15T00:00:00Z`. In a UTC-4 browser, that UTC instant converts to `2024-07-14T20:00:00-04:00`, which is the previous calendar day. The multi-argument `Date` constructor `new Date(year, month, day, ...)` always uses the local timezone, so the resulting Date object represents noon on July 15 in whatever timezone the browser runs in. Using noon (12:00) rather than midnight also guards against any edge cases where a locale observes a DST transition at midnight.

---

### Issue 2: `toLocaleDateString` formats a UTC instant in local time

**Problem:** Even after the Date object is constructed, `toLocaleDateString` without a `timeZone` option renders the instant in the browser's local timezone. If the Date internally represents UTC midnight on July 15, local rendering in UTC-4 would still display July 14.

**Fix:** By switching to the local-time constructor in CHANGE 1 (setting the date to local noon), `toLocaleDateString` with no `timeZone` override now correctly renders the right calendar date, because the local instant is unambiguously on July 15 regardless of offset.

**Explanation:** `toLocaleDateString` converts the underlying UTC timestamp to the browser's local timezone before picking the calendar date to display. If the timestamp is `2024-07-15T00:00:00Z` and the local offset is −4, the displayed date becomes July 14. Constructing the Date as local noon means the UTC equivalent is `2024-07-15T16:00:00Z` (for UTC-4), which stays on July 15 in every timezone from UTC-11 to UTC+12, so `toLocaleDateString` produces the correct day without needing a `timeZone` override. An alternative approach is to pass `{ timeZone: 'UTC' }` to `toLocaleDateString` while keeping the original UTC-midnight Date, but that is less portable and still depends on the `Intl` API supporting the `timeZone` option in all target environments.
