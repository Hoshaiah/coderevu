---
slug: linq-any-on-materialized-result
track: csharp
orderIndex: 49
title: ToList Before Any Fetches All Rows
difficulty: easy
tags:
  - linq
  - performance
  - ef-core
language: csharp
---

## Context

This code is in `Services/SubscriptionGuard.cs`, a service in a SaaS billing platform. It checks whether a tenant has any active subscriptions before allowing access to premium features. This guard is invoked on every request to feature-gated API endpoints, which can be in the hundreds per second during business hours.

Database load is abnormally high for what should be a lightweight existence check. SQL monitoring shows full table scans on the `Subscriptions` table returning all rows for every tenant, even those with thousands of historical records. P99 latency for gated endpoints has increased significantly over the past quarter as subscription history accumulates.

The team verified that indexes exist on `TenantId` and `Status`. They can see in the query plan that the index is used, but the query returns all matching rows instead of stopping at the first one.

## Buggy code

```csharp
public class SubscriptionGuard
{
    private readonly BillingDbContext _db;

    public SubscriptionGuard(BillingDbContext db)
    {
        _db = db;
    }

    public async Task<bool> TenantHasActiveSubscriptionAsync(Guid tenantId)
    {
        var subscriptions = await _db.Subscriptions
            .Where(s => s.TenantId == tenantId && s.Status == SubscriptionStatus.Active)
            .ToListAsync();

        return subscriptions.Any();
    }
}
```
