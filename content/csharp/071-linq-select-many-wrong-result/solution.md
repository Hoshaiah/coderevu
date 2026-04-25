## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — SelectMany Flattens Wrong Collection
// ------------------------------------------------------------------------

public IEnumerable<decimal> GetAllAdjustments(IEnumerable<Invoice> invoices)
{
    // CHANGE 1: Replace the two-argument SelectMany (which produced a nested sequence per line) with two chained single-argument SelectMany calls that flatten LineItems then Adjustments directly to decimal amounts.
    return invoices
        .SelectMany(invoice => invoice.LineItems)
        .SelectMany(line => line.Adjustments.Select(a => a.Amount));
}

// Domain types for reference:
// class Invoice   { IList<LineItem>   LineItems   }
// class LineItem  { IList<Adjustment> Adjustments }
// class Adjustment{ decimal           Amount      }
```

## Explanation

### Issue 1: Two-Argument SelectMany Returns Nested Sequence

**Problem:** The reconciliation report shows the correct count of adjustment entries but wrong values — specifically, when a single `LineItem` has more than one `Adjustment`, amounts from one adjustment are repeated in place of others. The output for a line with adjustments `[10, 20]` might come out as `[10, 10]` or `[20, 20]` instead of `[10, 20]`.

**Fix:** Replace the two-argument `SelectMany` overload (which takes a collection selector and a result selector) with two chained single-argument `SelectMany` calls: `.SelectMany(invoice => invoice.LineItems)` followed by `.SelectMany(line => line.Adjustments.Select(a => a.Amount))`. The second `SelectMany` in the original code is then also removed because flattening is handled inline.

**Explanation:** The two-argument overload of `SelectMany(collectionSelector, resultSelector)` pairs each source element with each element of its projected collection and passes both into the result selector. Here, `(invoice, line) => line.Adjustments.Select(a => a.Amount)` returns an `IEnumerable<decimal>` for each `(invoice, line)` pair — so the overall result is `IEnumerable<IEnumerable<decimal>>`, not `IEnumerable<decimal>`. The second `.SelectMany(amounts => amounts)` does flatten that one level, but the flattening is over the wrong structure: when a line has two adjustments, the result selector ran twice for that line (once per adjustment), emitting the full `Adjustments` sequence both times, which is what causes the duplication. Using two plain single-argument `SelectMany` calls avoids this entirely: the first flattens invoices to line items, and the second flattens line items to individual `Amount` values with no intermediate nesting. A related pitfall: the two-argument overload is useful when you need both the outer and inner element together (e.g., to build a composite key), but it is not a shortcut for two levels of flattening.

---
