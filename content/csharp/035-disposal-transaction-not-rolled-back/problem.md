---
slug: disposal-transaction-not-rolled-back
track: csharp
orderIndex: 35
title: Transaction Not Rolled Back on Exception
difficulty: medium
tags:
  - disposal
  - transactions
  - error-handling
  - database
language: csharp
---

## Context

This helper lives in `Data/OrderRepository.cs` and is called by the order-placement endpoint to insert an order header and its line items atomically. It opens an explicit `DbTransaction` so that the two inserts are committed together. The application targets SQL Server via `System.Data.SqlClient`.

In production, the team occasionally sees orphaned order headers with no line items in the database after downstream errors. The order count metrics and the line-item metrics drift apart over time. No exception is ever surfaced to the caller — the method returns normally.

The team confirmed that `InsertLineItemsAsync` does throw for certain malformed input, but they assumed the `using` block on the connection would clean things up. The real issue is with how the transaction lifetime is managed.

## Buggy code

```csharp
public async Task PlaceOrderAsync(Order order)
{
    using var connection = new SqlConnection(_connectionString);
    await connection.OpenAsync();

    using var transaction = connection.BeginTransaction();

    await InsertOrderHeaderAsync(connection, transaction, order);
    await InsertLineItemsAsync(connection, transaction, order.LineItems);

    transaction.Commit();
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
