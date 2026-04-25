## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Non-Promise Passed to Promise.all
// ------------------------------------------------------------------------

interface Report {
  userStats: UserStats;
  revenue: RevenueData;
  auditLogs: AuditLog[];
}

async function buildReport(userId: string): Promise<Report> {
  const [userStats, revenue, auditLogs] = await Promise.all([
    getUserStats(userId),
    getRevenue(userId),
    // CHANGE 1: Wrap getAuditLogs in Promise.resolve() so that whether it returns a plain AuditLog[] (cache hit) or a Promise<AuditLog[]> (DB fetch), Promise.all always receives a thenable and resolves to the array correctly.
    Promise.resolve(getAuditLogs(userId)),
  ]);

  return { userStats, revenue, auditLogs };
}

// Downstream serialization:
async function handleReportRequest(req: Request, res: Response) {
  const report = await buildReport(req.params.userId);
  res.json(report);  // auditLogs is now always a resolved AuditLog[], never a serialized Promise
}
```

## Explanation

### Issue 1: Non-Promise Return Breaks Async Consistency

**Problem:** `getAuditLogs` has two code paths: a cache hit that returns a plain `AuditLog[]` synchronously, and a DB fetch that returns `Promise<AuditLog[]>`. While `Promise.all` does call `Promise.resolve` internally on each element, the inconsistency means that any code path that accesses the return value of `getAuditLogs` before it flows into `Promise.all` — or any future refactor that destructures the array before awaiting — will see a raw Promise object. When that Promise object reaches `JSON.stringify`, it serializes as `{}` because Promises have no enumerable properties.

**Fix:** At the `CHANGE 1` site, the call `getAuditLogs(userId)` is wrapped with `Promise.resolve(getAuditLogs(userId))`. This means the value passed to `Promise.all` is always a real `Promise<AuditLog[]>`, regardless of whether `getAuditLogs` returned an array or a promise.

**Explanation:** `Promise.resolve(value)` is a no-op when `value` is already a native Promise — it returns the same Promise unchanged. When `value` is a plain array, it wraps it in an immediately-resolved Promise. This makes the behavior of `Promise.all` deterministic: it always receives a thenable in the third slot and always resolves `auditLogs` to an `AuditLog[]`. Without this wrap, the type of the third element in the array passed to `Promise.all` varies at runtime depending on whether the cache was warm, which is invisible to TypeScript if `getAuditLogs` is typed as returning `AuditLog[] | Promise<AuditLog[]>`. The real danger is that TypeScript may be typed to the broader `Promise<AuditLog[]>` return type, masking the synchronous path entirely at compile time while the bug only surfaces in production when the cache is populated.
