---
slug: linq-where-side-effect-in-predicate
track: csharp
orderIndex: 46
title: Mutating State Inside LINQ Predicate
difficulty: easy
tags:
  - linq
  - correctness
  - side-effects
language: csharp
---

## Context

This helper lives in `Reporting/InvoiceExporter.cs`. The method is called nightly by a background job that produces an export file of invoices that have not yet been sent to the billing provider. After filtering, the method marks each selected invoice as exported by setting a flag on the in-memory object before the caller persists the changes via Entity Framework.

The nightly job reports exporting the correct count of invoices, but in production the `ExportedAt` timestamps show that *every other* invoice in the filtered set is being skipped — the flag is set on some objects but those objects are never flushed. When developers run the job in a staging environment with fewer rows the problem does not reproduce consistently.

The team verified that the EF `SaveChanges` call is not throwing and that the connection string is correct. They also confirmed the predicate logic itself (date comparisons) is correct.

## Buggy code

```csharp
public class InvoiceExporter
{
    private readonly BillingDbContext _db;

    public InvoiceExporter(BillingDbContext db)
    {
        _db = db;
    }

    public List<Invoice> GetAndMarkUnexported()
    {
        var toExport = _db.Invoices
            .Where(i => i.ExportedAt == null && i.IssuedAt <= DateTime.UtcNow.AddDays(-1))
            .AsEnumerable()
            .Where(invoice =>
            {
                invoice.ExportedAt = DateTime.UtcNow;  // mark as exported
                return true;
            })
            .ToList();

        _db.SaveChanges();
        return toExport;
    }
}
```
