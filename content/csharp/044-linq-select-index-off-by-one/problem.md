---
slug: linq-select-index-off-by-one
track: csharp
orderIndex: 44
title: Select Index Seeds Wrong Value
difficulty: easy
tags:
  - linq
  - correctness
  - off-by-one
language: csharp
---

## Context

This code lives in `InvoiceFormatter.cs`, an accounts-receivable service that serializes line items into a flat invoice format required by a legacy EDI partner. The partner spec mandates that line item sequence numbers start at `1` and increment by `1`. EDI files with sequence number `0` on the first line are rejected by the partner's validator with a generic parse error.

The method was working correctly when line items were built manually with a `for` loop. A developer refactored it to use LINQ for brevity and the unit tests — which only checked field values, not the sequence number — continued to pass. The defect only surfaces when real EDI files are sent to the partner's staging environment.

No exceptions are thrown; the output is structurally valid JSON, but the sequence numbers are 0-based instead of 1-based.

## Buggy code

```csharp
public class InvoiceFormatter
{
    public IReadOnlyList<EdiLineItem> FormatLineItems(
        IReadOnlyList<OrderLine> lines)
    {
        return lines
            .Select((line, index) => new EdiLineItem
            {
                SequenceNumber = index,
                ProductCode    = line.Sku,
                Quantity       = line.Quantity,
                UnitPrice      = line.Price
            })
            .ToList();
    }
}
```
