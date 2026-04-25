## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Transaction Not Disposed on Throw
// ------------------------------------------------------------------------

public class TransferRepository
{
    private readonly string _connectionString;

    public TransferRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task TransferAsync(int fromId, int toId, decimal amount)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        // CHANGE 1: Wrap tx in `await using` so Dispose is always called, even when an exception escapes — this closes the server-side transaction and releases the connection cleanly back to the pool.
        await using var tx = conn.BeginTransaction();
        try
        {
            await conn.ExecuteAsync(
                "UPDATE Budgets SET Balance = Balance - @amount WHERE Id = @fromId",
                new { amount, fromId }, tx);

            await conn.ExecuteAsync(
                "UPDATE Budgets SET Balance = Balance + @amount WHERE Id = @toId",
                new { amount, toId }, tx);

            await tx.CommitAsync();
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            await tx.RollbackAsync();
            throw new InvalidOperationException("Insufficient funds or invalid account.", ex);
        }
        // CHANGE 2: Remove the bare catch that only handled error 547; any other exception now propagates naturally, and `await using` on tx guarantees Rollback+Dispose runs for ALL exception types via the IAsyncDisposable finalisation path.
    }
}
```

## Explanation

### Issue 1: SqlTransaction Not Disposed on Catch Path

**Problem:** When a transfer hits the `catch (SqlException ex) when (ex.Number == 547)` block, the code calls `RollbackAsync()` but never calls `tx.Dispose()`. The server-side transaction stays open, and the underlying connection is returned to the pool in a `Sleeping` state with an uncommitted transaction attached. Under load, all 100 pool slots fill with these zombie connections within a few hundred failed transfers.

**Fix:** Change `var tx = conn.BeginTransaction()` to `await using var tx = conn.BeginTransaction()`. `SqlTransaction` implements `IAsyncDisposable`; wrapping it in `await using` guarantees `DisposeAsync` is called when the `using` scope exits regardless of which code path (normal, caught exception, or uncaught exception) leaves the block.

**Explanation:** `await using` inserts a hidden `try/finally` that calls `DisposeAsync()` at the end of the enclosing scope. `SqlTransaction.DisposeAsync` rolls back any uncommitted work and marks the connection as available. Without this, `Rollback` alone is insufficient — the transaction object holds a reference that keeps the connection in an active state. The symptom (pool exhaustion for unrelated requests) happens because the pool is global per connection string; leaked connections from the transfer path starve every other database call in the process.

---

### Issue 2: Non-547 Exceptions Bypass All Cleanup

**Problem:** If any exception other than `SqlException` with number 547 is thrown inside the `try` block — for example a `TimeoutException`, a Dapper `InvalidOperationException`, or a network-level `SqlException` with a different error number — the `when` filter rejects it, the `catch` block is skipped entirely, and the transaction is neither rolled back nor disposed before the exception propagates up. This produces the same connection leak as Issue 1 for a broader set of failure modes.

**Fix:** Because `await using` on `tx` (from CHANGE 1) guarantees disposal on any exit path, the narrowly-filtered `catch` block no longer needs to be responsible for cleanup. The `catch` block now only needs to handle the business logic re-throw for error 547; all other exceptions propagate naturally and still get cleanup via `DisposeAsync`.

**Explanation:** `IAsyncDisposable.DisposeAsync` on `SqlTransaction` performs an implicit rollback if the transaction has not yet been committed. So even when an unexpected exception bypasses the `catch`, the `await using` finalisation path rolls back and disposes the transaction before the exception reaches the caller. The important rule to remember: never rely solely on a `catch` block for resource cleanup when the resource is disposable — pairing it with a `using` statement is the only guarantee that covers all exit paths including re-thrown and filtered exceptions.
