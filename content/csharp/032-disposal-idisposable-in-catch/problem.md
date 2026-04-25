---
slug: disposal-idisposable-in-catch
track: csharp
orderIndex: 32
title: Disposable Not Cleaned Up in Catch
difficulty: medium
tags:
  - disposal
  - resource-management
  - exceptions
language: csharp
---

## Context

This code lives in `Data/BulkImporter.cs` in a .NET 6 ETL service that imports CSV data into SQL Server using `SqlBulkCopy`. The `ImportAsync` method opens a connection, sets up a bulk copy operation, and writes rows to the database. It is called from a scheduled Hangfire job that may retry on failure.

Operators observe that after a failed import, subsequent runs fail immediately with `InvalidOperationException: The connection is already open` or hang waiting for a connection from the pool. Eventually the SQL Server connection pool is exhausted and all database access in the process fails.

The developer reviewed the code and noted there is a `using` for the `SqlConnection`, which they believed guaranteed cleanup on all paths.

## Buggy code

```csharp
public class BulkImporter
{
    private readonly string _connectionString;
    private readonly ILogger<BulkImporter> _logger;

    public BulkImporter(string connectionString, ILogger<BulkImporter> logger)
    {
        _connectionString = connectionString;
        _logger = logger;
    }

    public async Task ImportAsync(IDataReader reader, CancellationToken ct)
    {
        using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        var bulkCopy = new SqlBulkCopy(connection);
        bulkCopy.DestinationTableName = "dbo.ImportedRows";

        try
        {
            await bulkCopy.WriteToServerAsync(reader);
            _logger.LogInformation("Bulk import completed.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Bulk import failed.");
            throw;
        }
    }
}
```
