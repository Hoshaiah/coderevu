---
slug: linq-any-vs-count-always-enumerates
track: csharp
orderIndex: 45
title: Count Used Where Any Suffices
difficulty: easy
tags:
  - linq
  - performance
  - enumerable
language: csharp
---

## Context

This code lives in `PermissionChecker.cs`, a policy enforcement layer in a multi-tenant SaaS application. For each incoming API request, it checks whether the requesting user holds at least one active role that grants the required permission. The role list is fetched from a cached repository that returns an `IEnumerable<Role>` backed by a lazy database query.

Load testing reveals that permission checks account for 18% of total request latency at p99, even with caching in place. A flame graph shows that each check is fully materializing the role collection and iterating every element, even when a matching role is found at the very beginning of the collection. For users with many roles (up to 500 in large enterprise tenants), this is measurably slow.

The developer originally wrote `Count() > 0` as a habit from working with `ICollection`, not realizing that on a lazy `IEnumerable` this forces complete enumeration every time.

## Buggy code

```csharp
public class PermissionChecker
{
    private readonly IRoleRepository _roles;

    public PermissionChecker(IRoleRepository roles)
    {
        _roles = roles;
    }

    public bool HasPermission(int userId, string permissionCode)
    {
        IEnumerable<Role> roles = _roles.GetActiveRolesForUser(userId);

        return roles.Count(r =>
            r.Permissions.Contains(permissionCode)
        ) > 0;
    }
}
```
