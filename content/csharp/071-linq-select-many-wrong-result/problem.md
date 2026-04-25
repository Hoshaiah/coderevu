---
slug: linq-select-many-wrong-result
track: csharp
orderIndex: 71
title: SelectMany Flattens Wrong Collection
difficulty: hard
tags:
  - linq
  - correctness
  - projection
  - collections
language: csharp
---

## Context

This method is in `Billing/InvoiceLineService.cs` and produces a flat list of all adjustment amounts across a batch of invoices for an end-of-month reconciliation report. Each `Invoice` has a collection of `LineItems`, and each `LineItem` has a collection of `Adjustments`. The reconciliation tool expects every adjustment amount in a single flat `IEnumerable<decimal>`.

Finance reports that the reconciliation totals are wrong — the output contains the correct *number* of values but many amounts are repeated incorrectly. The bug only manifests for invoices where a single line item has more than one adjustment. For invoices with at most one adjustment per line, the output happens to be correct.

A unit test that uses a single adjustment per line was passing, which is why the bug was not caught before the report ran in production.

## Buggy code

```csharp
public IEnumerable<decimal> GetAllAdjustments(IEnumerable<Invoice> invoices)
{
    return invoices
        .SelectMany(invoice => invoice.LineItems,
            (invoice, line) => line.Adjustments
                                   .Select(a => a.Amount))
        .SelectMany(amounts => amounts);
}

// Domain types for reference:
// class Invoice   { IList<LineItem>   LineItems   }
// class LineItem  { IList<Adjustment> Adjustments }
// class Adjustment{ decimal           Amount      }
```
