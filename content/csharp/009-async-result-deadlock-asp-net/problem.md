---
slug: async-result-deadlock-asp-net
track: csharp
orderIndex: 9
title: Blocking .Result Call Causes Deadlock
difficulty: easy
tags:
  - async
  - deadlock
  - synchronization-context
language: csharp
---

## Context

`Middleware/TenantResolutionMiddleware.cs` is an early-pipeline ASP.NET Framework middleware (System.Web, not Core) responsible for resolving the current tenant from the request host header and attaching it to the request context. It calls a shared async cache service that was recently migrated from sync to async.

After the cache service migration, random requests hang indefinitely and eventually time out with no helpful log output. The hang is not related to specific tenants — any request can deadlock. The middleware was not changed during the migration, only the cache service it calls.

The team confirmed the cache service works correctly when awaited in async controller actions. The issue only appears in the middleware layer.

## Buggy code

```csharp
public class TenantResolutionMiddleware : IHttpModule
{
    private readonly ITenantCacheService _cache;

    public TenantResolutionMiddleware(ITenantCacheService cache)
    {
        _cache = cache;
    }

    public void OnBeginRequest(object sender, EventArgs e)
    {
        var app = (HttpApplication)sender;
        var host = app.Request.Url.Host;

        // Synchronously block on an async method
        var tenant = _cache.ResolveAsync(host).Result;

        app.Context.Items["Tenant"] = tenant;
    }
}
```
