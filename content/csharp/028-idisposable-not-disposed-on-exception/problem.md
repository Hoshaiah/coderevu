---
slug: idisposable-not-disposed-on-exception
track: csharp
orderIndex: 28
title: Transaction Not Disposed on Throw
difficulty: medium
tags:
  - disposal
  - transactions
  - error-handling
language: csharp
---

## Context

This is in `Repositories/TransferRepository.cs`, part of a banking-style internal tool that moves budget between cost centres. It uses `System.Data.SqlClient` directly (not EF). The code opens a transaction, performs two updates, and commits. The integration team added the try/catch to handle constraint violations gracefully.

Under load testing, the SQL Server connection pool exhausts after a few hundred failed transfers. `SqlException: Timeout expired. The timeout period elapsed prior to obtaining a connection from the pool` starts appearing for *all* requests, including ones unrelated to transfers. The connection pool maximum is 100.

The team confirmed that successful transfers don't leak connections. They also confirmed that failed transfers (those that hit the catch block) correlate exactly with the pool exhaustion. Profiling shows connections stuck in the `Sleeping` state with an open transaction.

## Buggy code

```csharp
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

        var tx = conn.BeginTransaction();
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
    }
}
```
