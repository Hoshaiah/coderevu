---
slug: promise-all-silent-type-error
track: javascript
orderIndex: 4
title: Non-Promise Passed to Promise.all
difficulty: easy
tags:
  - async
  - types
  - error-handling
language: typescript
---

## Context

This function lives in `src/services/reportBuilder.ts`. It is responsible for fetching three independent data sources — user stats, revenue figures, and audit logs — concurrently and assembling them into a single report object that is serialized to JSON and sent to the client.

In staging, the function works fine most of the time, but occasionally the `auditLogs` field in the response is a resolved Promise object (serialized as `{}`) rather than the expected array of log entries. This happens non-deterministically and seems related to the `getAuditLogs` function sometimes being synchronous (returning a plain array from a cache) versus asynchronous (fetching from the DB).

The team confirmed through logs that `getAuditLogs` does sometimes return a plain array synchronously. The report builder was written assuming it always returns a Promise.

## Buggy code

```typescript
interface Report {
  userStats: UserStats;
  revenue: RevenueData;
  auditLogs: AuditLog[];
}

async function buildReport(userId: string): Promise<Report> {
  const [userStats, revenue, auditLogs] = await Promise.all([
    getUserStats(userId),
    getRevenue(userId),
    getAuditLogs(userId),  // sometimes returns AuditLog[] directly (from cache)
  ]);

  return { userStats, revenue, auditLogs };
}

// Downstream serialization:
async function handleReportRequest(req: Request, res: Response) {
  const report = await buildReport(req.params.userId);
  res.json(report);  // if auditLogs is a Promise, JSON.stringify gives {}
}
```
