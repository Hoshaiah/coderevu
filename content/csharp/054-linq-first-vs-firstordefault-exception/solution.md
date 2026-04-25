## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — First() on Filtered Sequence Throws on Miss
// ------------------------------------------------------------------------

public class FeatureFlagService
{
    private volatile List<FeatureFlag> _flags = new();

    public void RefreshFlags(IEnumerable<FeatureFlag> latest)
    {
        _flags = latest.ToList();
    }

    public FeatureFlag GetFlag(string name)
    {
        // CHANGE 1: Replace First() with FirstOrDefault() and supply a disabled default so a missing flag never throws.
        return _flags.FirstOrDefault(f => f.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
               ?? new FeatureFlag { Name = name, IsEnabled = false };
    }

    public bool IsEnabled(string name)
    {
        // CHANGE 2: GetFlag() now always returns a non-null object, so this safely returns false for any unknown flag.
        return GetFlag(name).IsEnabled;
    }
}
```

## Explanation

### Issue 1: `First()` Throws on Missing Flag

**Problem:** When a feature flag is removed from the database and the in-memory list is refreshed, any in-flight request that calls `GetFlag` with that name hits `First()` on an empty filtered sequence. LINQ throws `InvalidOperationException: Sequence contains no matching element`, the exception is uncaught, and the caller gets a 500 response.

**Fix:** Replace `First(predicate)` with `FirstOrDefault(predicate)` and use the null-coalescing operator `??` to return `new FeatureFlag { Name = name, IsEnabled = false }` when the result is `null`.

**Explanation:** `First()` guarantees it returns an element and throws if none matches. `FirstOrDefault()` returns `null` (for reference types) instead of throwing when nothing matches. By coalescing to a freshly constructed disabled `FeatureFlag`, callers always receive a valid object. The disabled default is the safest fallback: a flag that was just deleted should behave as though it was never enabled, which matches what the team wants. A related pitfall is using `SingleOrDefault` here — it would still throw if somehow two flags share the same name, so `FirstOrDefault` is more defensive.

---

### Issue 2: `IsEnabled` Unsafe Against Null / Exception Propagation

**Problem:** Before the fix, `IsEnabled` calls `GetFlag`, which could throw `InvalidOperationException`. Even if a null-return variant were used without the coalescing fallback, `IsEnabled` would then dereference `null` and throw `NullReferenceException`. Either way, callers of `IsEnabled` get an unhandled exception instead of a `false` result.

**Fix:** Because `GetFlag` now always returns a non-null `FeatureFlag` (guaranteed by the `??` fallback in CHANGE 1), `IsEnabled` can remain a single-line property read — `GetFlag(name).IsEnabled` — without any additional null checks.

**Explanation:** `IsEnabled` is the public entry point most request handlers call. Its contract should be "tell me true or false", never "throw". With the fallback object in place, `GetFlag` satisfies that contract at the source, so `IsEnabled` inherits the safety automatically. If the fallback were omitted and `FirstOrDefault` alone were used, `IsEnabled` would need its own null guard (`GetFlag(name)?.IsEnabled ?? false`), creating two places to maintain the same logic. Fixing it once in `GetFlag` is cleaner and ensures every future caller is safe by default.
