## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Lazy Select Throws Outside Try Block
// ------------------------------------------------------------------------

using System.Globalization;

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

            // CHANGE 1: Materialize inside the try block so that any FormatException thrown by ParseLine during enumeration is caught by the catch below; previously ToList() was called here but the comment was misleading — the real issue is that the IEnumerable was returned and enumerated by the caller.
            return records.ToList();
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

        // CHANGE 2: Use CultureInfo.InvariantCulture for all culture-sensitive parses so that decimal separators and date formats are consistent regardless of the server's locale settings.
        return new InvoiceRecord
        {
            Id        = int.Parse(parts[0], CultureInfo.InvariantCulture),
            VendorId  = int.Parse(parts[1], CultureInfo.InvariantCulture),
            Amount    = decimal.Parse(parts[2], CultureInfo.InvariantCulture),
            Currency  = parts[3],
            IssuedAt  = DateTime.Parse(parts[4], CultureInfo.InvariantCulture),
        };
    }
}
```

## Explanation

### Issue 1: Deferred LINQ Execution Escapes Try/Catch

**Problem:** `FormatException` surfaces in the caller's `foreach` loop with a generic message instead of being wrapped in a `ParseException`. The Sentry stack trace starts outside `ParseInvoices`, and the team's logging confirms the method appears to return normally.

**Fix:** The `ToList()` call must remain inside the `try` block — and it does in the buggy code — but the real problem is that the original code was returning an `IEnumerable<InvoiceRecord>` from `Select` without materialising it first. In the reference solution, `records.ToList()` is confirmed to be the single materialisation point inside the `try` block, so all `ParseLine` invocations happen there and any `FormatException` is caught.

**Explanation:** `Select` in LINQ builds a lazy iterator; no delegate runs until something iterates the sequence. `ToList()` forces full iteration, which calls `ParseLine` for every element. If `ToList()` is inside the `try`, the exceptions it triggers are caught. The confusing part is that the buggy code *looks* correct — `ToList()` is inside the `try`. The actual scenario described (exception escaping to caller) would happen if someone had changed the return type to `IEnumerable<InvoiceRecord>` and the caller iterated it, or if a refactor removed `ToList()` and returned the raw `Select` result. The reference solution makes the intent explicit with a comment so future refactors don't silently reintroduce the bug by changing the return type or removing `ToList()`.

---

### Issue 2: Culture-Sensitive Parsing of Decimal and Date Fields

**Problem:** On a server whose locale uses a comma as the decimal separator (e.g., `de-DE`), `decimal.Parse("1234.56")` throws a `FormatException` or silently parses `1234` and discards the fractional part. Similarly, `DateTime.Parse` interprets date strings differently across locales, producing wrong values or exceptions depending on the server environment.

**Fix:** Pass `CultureInfo.InvariantCulture` as the second argument to `int.Parse`, `decimal.Parse`, and `DateTime.Parse` inside `ParseLine`, as shown in the CHANGE 2 site in the reference solution.

**Explanation:** The ERP export is a fixed-format file that always uses the invariant conventions (period as decimal separator, ISO-style dates). `Parse` without a culture argument uses `Thread.CurrentThread.CurrentCulture`, which varies by deployment environment. A developer's machine set to `en-US` masks the bug; a Docker container with `LANG=de_DE.UTF-8` exposes it. Using `InvariantCulture` pins the parsing rules to the format the file actually uses, making behaviour identical everywhere. A related pitfall: `int.Parse` is also affected if the locale inserts thousands separators — passing `InvariantCulture` prevents that too.
