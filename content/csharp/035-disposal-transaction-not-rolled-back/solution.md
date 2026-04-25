## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Transaction Not Rolled Back on Exception
// ------------------------------------------------------------------------

public async Task PlaceOrderAsync(Order order)
{
    using var connection = new SqlConnection(_connectionString);
    await connection.OpenAsync();

    using var transaction = connection.BeginTransaction();

    // CHANGE 1 & 3: Wrap both inserts in try/catch so any exception triggers an explicit Rollback before re-throwing, preventing orphaned rows and ensuring the caller sees the failure.
    try
    {
        await InsertOrderHeaderAsync(connection, transaction, order);
        await InsertLineItemsAsync(connection, transaction, order.LineItems);

        transaction.Commit();
    }
    // CHANGE 2: catch the exception, roll back the transaction to undo the header insert, then re-throw so the caller is informed of the failure instead of receiving a silent success.
    catch (Exception)
    {
        // CHANGE 1 & 3: Explicit Rollback undoes InsertOrderHeaderAsync's INSERT when InsertLineItemsAsync (or anything else) throws, keeping the header and line-item counts consistent.
        transaction.Rollback();
        throw;
    }
}

private async Task InsertOrderHeaderAsync(
    SqlConnection conn,
    SqlTransaction tx,
    Order order)
{
    // ... executes INSERT via SqlCommand with tx
}

private async Task InsertLineItemsAsync(
    SqlConnection conn,
    SqlTransaction tx,
    IEnumerable<LineItem> items)
{
    // ... executes INSERT per item, may throw
}
```

## Explanation

### Issue 1: Orphaned rows on partial failure

**Problem:** When `InsertLineItemsAsync` throws, the order header row that `InsertOrderHeaderAsync` already wrote is left in an indeterminate state. In practice, SQL Server's connection-pool recycling eventually cleans up open transactions, but the header INSERT can be flushed before that happens, leaving a row with no corresponding line items. Operators see the order-header count and line-item count drift apart over time.

**Fix:** A `try/catch` block wraps both `await` calls. In the `catch` branch, `transaction.Rollback()` is called before `throw`, which explicitly undoes `InsertOrderHeaderAsync`'s INSERT whenever either insert fails.

**Explanation:** A `SqlTransaction` is not automatically rolled back when an exception escapes the method. The `using` on the connection disposes the connection, not the transaction; disposing a connection that has an open transaction causes the underlying TDS session to be reset, but the exact moment of that reset is non-deterministic under connection pooling. Calling `transaction.Rollback()` explicitly inside `catch` ensures the rollback happens immediately and deterministically, before the connection is returned to the pool. A related pitfall: if `Rollback()` itself throws (e.g., the connection drops), you may want to wrap it in its own try/catch and log, but still re-throw the original exception.

---

### Issue 2: Exception silently swallowed, caller sees false success

**Problem:** Without a `throw` in the failure path, `PlaceOrderAsync` returns normally even after a partial database failure. The order-placement endpoint treats this as a successful placement, sends a confirmation to the customer, and increments metrics — none of which is accurate.

**Fix:** The `catch` block ends with a bare `throw` statement, which re-throws the original exception (preserving its stack trace) so it propagates to the caller.

**Explanation:** In the original code there is no `try/catch` at all, so any exception from `InsertLineItemsAsync` propagates up on its own — but the transaction is never rolled back first, which is the primary problem. Adding the `try/catch` to fix the rollback issue creates a new responsibility: the `catch` must not accidentally suppress the exception. A bare `throw` (not `throw ex`) re-throws while keeping the original `Exception.StackTrace` intact, which matters for logging and diagnostics. If you used `throw ex` instead, the stack trace would be truncated to the `catch` site, making it harder to find the root cause.

---

### Issue 3: Commit called outside try/finally, rollback never guaranteed

**Problem:** `transaction.Commit()` sits outside any error-handling construct. If an exception occurs anywhere before it, the transaction object goes out of scope without an explicit `Rollback()` call. SQL Server will eventually roll back the server-side transaction, but `SqlTransaction` does not guarantee when its finalizer or the connection reset fires, so lock escalation and log retention can be affected in the interim.

**Fix:** `transaction.Commit()` is moved inside the `try` block, so it only executes when both inserts succeed. The `catch` block calls `transaction.Rollback()` for every other outcome.

**Explanation:** Placing `Commit()` inside the `try` block means it only runs on the happy path. If `Commit()` itself throws (e.g., a network failure mid-commit), the `catch` will call `Rollback()`, which SQL Server will ignore if the commit already completed, or honor if it did not — either way the state is consistent. A `finally` block is a tempting alternative, but calling `Rollback()` unconditionally in `finally` would roll back a successfully committed transaction on some drivers; the explicit `catch`-then-`throw` pattern is safer here.
