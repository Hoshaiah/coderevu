## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — StreamReader Leaked on Parse Error
// ------------------------------------------------------------------------

public IReadOnlyList<RouteEntry> ParseConfigFile(string filePath)
{
    // CHANGE 1: Wrap reader in a using statement so Dispose is called on every exit path, including exceptions.
    using var reader = new StreamReader(filePath);
    var entries = new List<RouteEntry>();

    try
    {
        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#"))
                continue;

            var parts = line.Split(',');
            if (parts.Length != 3)
                throw new FormatException($"Invalid line: {line}");

            entries.Add(new RouteEntry(parts[0].Trim(), parts[1].Trim(), int.Parse(parts[2].Trim())));
        }

        // CHANGE 2: Remove the manual reader.Dispose() call — the using declaration above handles this reliably.
    }
    catch (FormatException ex)
    {
        throw new ConfigurationException("Config file is malformed.", ex);
    }

    return entries;
}
```

## Explanation

### Issue 1: StreamReader not disposed on exception path

**Problem:** When a line fails the `parts.Length != 3` check, a `FormatException` is thrown and caught, then rethrown as a `ConfigurationException`. Execution never reaches `reader.Dispose()`, so the underlying file handle stays open. The operator sees "The process cannot access the file because it is being used by another process" whenever they try to replace the bad config file, and the only recovery is killing the service.

**Fix:** Replace `var reader = new StreamReader(filePath)` with `using var reader = new StreamReader(filePath)` (CHANGE 1) and remove the manual `reader.Dispose()` call inside the `try` block (CHANGE 2). The `using` declaration guarantees `Dispose` is called when the variable goes out of scope, regardless of whether the method returns normally or throws.

**Explanation:** The C# `using` statement compiles to a `try/finally` block where `Dispose` sits in the `finally` clause. A `finally` clause runs whether the `try` body completes normally or throws, so there is no path through the method that skips cleanup. The original code placed `Dispose` as a plain statement at the end of `try`, which only executes when the loop finishes without error — exactly the path that does not need recovery. A related pitfall: wrapping just the `catch` body in a `finally` would also work, but `using` is shorter and harder to get wrong during future edits.

---

### Issue 2: Manual Dispose call inside try block is fragile

**Problem:** Even setting aside the exception path, calling `reader.Dispose()` explicitly as the last statement in a `try` block is a pattern that misleads reviewers into thinking resource cleanup is handled correctly. Any new `throw` statement, early `return`, or `continue` added above that line in future maintenance would silently skip disposal again.

**Fix:** Remove the `reader.Dispose()` line entirely (CHANGE 2) and rely solely on the `using var` declaration introduced in CHANGE 1. The compiler-generated `finally` block from `using` is unconditional and cannot be accidentally bypassed by new code inserted into the method body.

**Explanation:** When disposal is done manually, every branch of a method must be audited to confirm the dispose call is reachable. A `using` declaration moves that responsibility to the compiler: it wraps the entire remaining scope in a hidden `finally`. This means that adding an early `return entries` for an empty-file fast-path, or adding another `throw` for a different validation rule, would not introduce a new leak. The manual pattern is also easy to misread during review — the candidate in the problem description looked at the `try/catch` and assumed cleanup was handled, which is exactly the confusion a `using` statement prevents.
