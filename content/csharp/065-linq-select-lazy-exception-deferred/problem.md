---
slug: linq-select-lazy-exception-deferred
track: csharp
orderIndex: 65
title: Lazy Select Throws Outside Try Block
difficulty: medium
tags:
  - linq
  - deferred-execution
  - error-handling
language: csharp
---

## Context

`InvoiceParser.cs` is a utility class inside a finance microservice that parses tab-delimited invoice export files received from a legacy ERP system. Each line is mapped to an `InvoiceRecord` by a `Select` projection. The method is supposed to return a list of valid records or throw a descriptive `ParseException` if any line is malformed.

Support tickets show that sometimes a `FormatException` escapes to the global exception handler with a generic message like `Input string was not in a correct format`, bypassing the custom `ParseException` wrapping that should be happening. Sentry shows the call stack starting from the caller's `foreach` loop, not from inside `ParseInvoices`.

The team added logging at the top of the `try` block and confirmed it fires. They added logging just before the `return` statement and confirmed it fires too. Yet the `FormatException` is still not caught by the `catch (FormatException)` block. The method appears to return successfully and then blow up in the caller.

## Buggy code

```csharp
public class InvoiceParser
{
    public IReadOnlyList<InvoiceRecord> ParseInvoices(string[] lines)
    {
        try
        {
            var records = lines
                .Skip(1) // header row
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .Select(ParseLine);

            return records.ToList(); // deferred execution materialises here
        }
        catch (FormatException ex)
        {
            throw new ParseException("Invoice file contains malformed data.", ex);
        }
    }

    private InvoiceRecord ParseLine(string line)
    {
        var parts = line.Split('\t');
        if (parts.Length < 5)
            throw new FormatException($"Expected 5 fields, got {parts.Length}: '{line}'");

        return new InvoiceRecord
        {
            Id        = int.Parse(parts[0]),
            VendorId  = int.Parse(parts[1]),
            Amount    = decimal.Parse(parts[2]),
            Currency  = parts[3],
            IssuedAt  = DateTime.Parse(parts[4]),
        };
    }
}
```
