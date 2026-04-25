## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — ToList Before Any Fetches All Rows
// ------------------------------------------------------------------------

public class SubscriptionGuard
{
    private readonly BillingDbContext _db;

    public SubscriptionGuard(BillingDbContext db)
    {
        _db = db;
    }

    public async Task<bool> TenantHasActiveSubscriptionAsync(Guid tenantId)
    {
        // CHANGE 1: Replace ToListAsync()+Any() with AnyAsync() so EF Core emits SELECT 1 WHERE EXISTS(...) and stops at the first matching row instead of fetching all rows.
        return await _db.Subscriptions
            .Where(s => s.TenantId == tenantId && s.Status == SubscriptionStatus.Active)
            .AnyAsync();
    }
}
```

## Explanation

### Issue 1: ToListAsync Materializes All Rows Before Existence Check

**Problem:** Every call to `TenantHasActiveSubscriptionAsync` pulls every active subscription row for the tenant into application memory, then calls `.Any()` on the in-memory list. Tenants with hundreds or thousands of historical active-status records cause EF Core to transfer all of those rows over the network before the method can return `true`.

**Fix:** Remove `ToListAsync()` and the intermediate `subscriptions` variable entirely. Replace them with a single `AnyAsync()` call chained directly to the `Where` clause, as shown at CHANGE 1.

**Explanation:** When you call `ToListAsync()`, EF Core executes `SELECT * FROM Subscriptions WHERE TenantId = @p0 AND Status = @p1` with no `TOP` or `LIMIT`, so the database engine reads every qualifying row and sends them all to the application. The index on `TenantId` and `Status` is used — meaning the full-table scan is avoided — but the index scan still returns every matching row. `AnyAsync()` instead translates to `SELECT CASE WHEN EXISTS (SELECT 1 FROM Subscriptions WHERE ...) THEN 1 ELSE 0 END`, which lets the database engine stop at the very first matching row. Because this guard runs on every request to feature-gated endpoints, the difference is multiplicative: a tenant with 1 000 active-status rows causes 1 000× the data transfer per request compared to the corrected query. A related pitfall is using `CountAsync() > 0` instead of `AnyAsync()` — that also counts all matching rows rather than short-circuiting at the first hit.

---
