---
slug: linq-count-prevents-early-exit
track: csharp
orderIndex: 51
title: Count Instead of Any Exhausts Sequence
difficulty: easy
tags:
  - linq
  - performance
  - correctness
language: csharp
---

## Context

This guard check sits at the top of `Services/InvoiceValidationService.cs` and is called before generating an invoice PDF. The method receives an enumerable of line items from a LINQ query against a large EF Core result set that may contain thousands of rows.

During load testing the team noticed that the validation step alone accounted for over 80% of the total response time for some invoices. Profiling showed the database was returning full result sets when the application only needed to know whether any rows existed. The query plans showed a full table scan with no early termination.

The developer initially suspected a missing index but the DBA confirmed the index is present and used — the issue is that the query retrieves all matching rows every time.

## Buggy code

```csharp
public ValidationResult Validate(IEnumerable<InvoiceLineItem> lineItems)
{
    if (lineItems.Count() == 0)
    {
        return ValidationResult.Fail("Invoice must have at least one line item.");
    }

    if (lineItems.Count(li => li.Quantity <= 0) > 0)
    {
        return ValidationResult.Fail("All line items must have a positive quantity.");
    }

    if (lineItems.Count(li => li.UnitPrice < 0) > 0)
    {
        return ValidationResult.Fail("Unit prices cannot be negative.");
    }

    return ValidationResult.Ok();
}
```
