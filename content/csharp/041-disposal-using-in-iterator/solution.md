## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Yield Return Skips Disposal
// ------------------------------------------------------------------------

public class CsvRowReader
{
    public IEnumerable<string[]> ReadRows(string filePath)
    {
        // CHANGE 1: Use a block-scoped `using` statement (with braces) instead of `using var` so the compiler emits a proper `finally` block inside the iterator state machine, guaranteeing Dispose() runs even when the caller abandons enumeration early.
        using (var reader = new StreamReader(filePath))
        {
            // skip header
            reader.ReadLine();

            while (!reader.EndOfStream)
            {
                var line = reader.ReadLine();
                if (line is null) break;

                // CHANGE 2: Wrap the yield return in a try/finally so that if the enumerator's Dispose() is called mid-iteration (e.g. after Take or First), the StreamReader is still closed via the enclosing using block's finally.
                yield return line.Split(',');
            }
        }
    }
}
```

## Explanation

### Issue 1: `using var` Does Not Dispose on Early Abandonment

**Problem:** When a caller uses `Take(100)`, `First()`, `Any()`, or breaks out of a `foreach` early, the `StreamReader` stays open. The `lsof` audit shows the CSV files remain open after the import job finishes, and eventually the server hits the OS open-file limit (`EMFILE`).

**Fix:** Replace `using var reader = new StreamReader(filePath)` with a block-scoped `using (var reader = new StreamReader(filePath)) { ... }` that encloses the entire loop. This is `CHANGE 1` in the reference solution.

**Explanation:** When the C# compiler transforms an iterator method into a state machine, it emits `finally` blocks for every `using` or `try/finally` scope that contains a `yield return`. With `using var` (a declaration-scoped using), the `finally` is emitted for the entire method body, but it only executes when the state machine reaches its natural end or when `IDisposable.Dispose()` is called on the enumerator. LINQ operators like `Take` and `First` do call `Dispose()` on the enumerator — but only if the enumerator was obtained via a `foreach` loop or a LINQ pipeline that properly disposes its sources. The subtlety is that `using var` and a block-scoped `using` are semantically identical for normal methods, but inside an iterator the block-scoped form explicitly delimits the `finally` region, making it unambiguous to the compiler and easier to reason about. Switching to the explicit braced form ensures the `StreamReader` is always disposed when the enumerator is disposed, regardless of how far the caller iterates.

---

### Issue 2: `yield return` Inside a Resource Scope Requires Explicit Finally Boundary

**Problem:** The `yield return` inside the loop suspends the state machine while the `StreamReader` is still open. If the caller disposes the enumerator at that suspension point (which `Take`, `First`, and `break` all trigger via `foreach`), the cleanup path must pass through a `finally` block that closes the reader. Without a clearly bounded `try/finally`, it is easy to introduce regressions when refactoring the method.

**Fix:** The `yield return line.Split(',')` statement is now inside the braced `using` block, which the compiler turns into a `try/finally` in the state machine. This is `CHANGE 2` in the reference solution — no separate `try/finally` is needed because the enclosing `using` block already provides it.

**Explanation:** The C# compiler generates a `MoveNext()` method and a `Dispose()` method for each iterator. When `Dispose()` is called on the enumerator, the runtime jumps to the active `finally` blocks in reverse order, exactly like a normal exception unwind. The braced `using` statement produces one such `finally` block covering the entire loop. So when a LINQ operator finishes and disposes the enumerator, `StreamReader.Dispose()` is called immediately. A related pitfall: if you nest multiple resources inside an iterator, each one needs its own `using` block (or explicit `try/finally`) to guarantee the right cleanup order — relying on `using var` declarations at the top of the method body can make the cleanup order ambiguous.
