## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Count Used Where Any Suffices
// ------------------------------------------------------------------------

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

        // CHANGE 1 & 2: Replace Count(...) > 0 with Any(...) so enumeration stops at the first matching role instead of walking the entire collection.
        return roles.Any(r =>
            r.Permissions.Contains(permissionCode)
        );
    }
}
```

## Explanation

### Issue 1: Full Enumeration on Lazy IEnumerable

**Problem:** Every call to `HasPermission` fully materializes the role collection, even when a matching role is found near the start. On a large enterprise tenant with 500 roles, this iterates all 500 elements and counts them before returning a boolean, inflating p99 latency measurably.

**Fix:** Replace `roles.Count(predicate) > 0` with `roles.Any(predicate)`. `Any` returns `true` immediately upon finding the first element that satisfies the predicate and does not touch the rest of the sequence.

**Explanation:** `IEnumerable<T>` backed by a lazy query has no stored length. When you call `Count()`, LINQ must pull every element through the iterator to increment a counter. There is no shortcut — even with a predicate, `Count` accumulates a total and only then compares to zero. `Any`, by contrast, calls `MoveNext()` on the enumerator inside a loop that breaks as soon as the predicate returns `true`. For a user whose first role already grants the permission, `Any` does one iteration; `Count` does 500. The performance gap grows linearly with collection size and compounds across thousands of requests per second.

---

### Issue 2: Semantically Wrong Method for Existence Check

**Problem:** Using `Count() > 0` to test for existence obscures intent and invites future maintainers to keep the same pattern, perpetuating the performance problem. The code asks "how many?" when the actual question is "does any?"

**Fix:** Replace the entire expression `roles.Count(r => r.Permissions.Contains(permissionCode)) > 0` with `roles.Any(r => r.Permissions.Contains(permissionCode))`, which directly expresses the existence check and returns a `bool` without an intermediate integer.

**Explanation:** `Any(predicate)` is the idiomatic LINQ method for "does at least one element satisfy this condition?". Using `Count() > 0` achieves the same boolean result but through an integer intermediate that carries no useful information here and costs extra work. A related pitfall: if someone later changes the code to `Count() >= 2` to mean "has multiple matching roles", that is a valid use of `Count`; but for a simple exists-check, `Any` communicates the requirement unambiguously and lets the runtime (or a future LINQ provider, such as EF Core) apply provider-level optimizations like translating to `EXISTS` in SQL rather than `COUNT(*)`.
