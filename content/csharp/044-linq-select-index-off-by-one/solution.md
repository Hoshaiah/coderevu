## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Select Index Seeds Wrong Value
// ------------------------------------------------------------------------

public class InvoiceFormatter
{
    public IReadOnlyList<EdiLineItem> FormatLineItems(
        IReadOnlyList<OrderLine> lines)
    {
        return lines
            // CHANGE 1: Add 1 to index so sequence numbers are 1-based (EDI spec requires first item = 1, not 0).
            .Select((line, index) => new EdiLineItem
            {
                SequenceNumber = index + 1,
                ProductCode    = line.Sku,
                Quantity       = line.Quantity,
                UnitPrice      = line.Price
            })
            .ToList();
    }
}
```

## Explanation

### Issue 1: Zero-Based Sequence Number Off-By-One

**Problem:** Every `SequenceNumber` in the generated EDI file is one less than the partner expects. The first line item gets `SequenceNumber = 0`, the second gets `1`, and so on. The EDI partner's validator rejects any file whose first sequence number is `0`, producing a generic parse error with no indication of which field is wrong.

**Fix:** Replace `SequenceNumber = index` with `SequenceNumber = index + 1` at the `CHANGE 1` site. This shifts all generated sequence numbers up by one so they match the 1-based contract in the EDI spec.

**Explanation:** The two-argument `Select((element, index) => ...)` overload always passes a zero-based index — `0` for the first element, `1` for the second, and so on. The original `for`-loop implementation presumably started its counter at `1` (e.g., `for (int i = 1; i <= lines.Count; i++)`), so the business rule was encoded in the loop initializer. When the developer rewrote the method with LINQ, they matched the structural shape of the old loop but did not account for the different starting point of the LINQ index parameter. Because unit tests only validated `ProductCode`, `Quantity`, and `UnitPrice`, the off-by-one went undetected in CI. Adding `+ 1` restores the 1-based numbering without changing anything else. A related pitfall: if the spec ever required sequence numbers to start at a value other than `1` (e.g., continuing from a previous batch), hardcoding `+ 1` would still be wrong — in that case you would accept the starting offset as a parameter and write `index + startOffset`.

---

### Issue 2: No Documentation of 1-Based Constraint

**Problem:** Nothing in the code communicates that `SequenceNumber` must be 1-based. The next engineer who reads or modifies `FormatLineItems` has no in-code signal that the `+ 1` is load-bearing, making it easy to "clean it up" or repeat the same mistake in a future refactor.

**Fix:** The `// CHANGE 1` comment added directly above the `Select` lambda explains the EDI requirement inline, so the constraint is visible at the exact line where it is enforced. No separate documentation file or ticket reference is needed for this level of detail.

**Explanation:** A constraint that exists only in an external spec document or a partner's staging-environment error message is effectively invisible to the developer reading the code. Inline comments at the enforcement point are the lowest-friction way to preserve this context. The comment does not need to repeat the entire spec — naming the rule ("EDI spec requires first item = 1, not 0") is enough for a reviewer to know the `+ 1` is intentional and to look up the spec if they need more detail.
