## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Count Instead of Any Exhausts Sequence
// ------------------------------------------------------------------------

public ValidationResult Validate(IEnumerable<InvoiceLineItem> lineItems)
{
    // CHANGE 1: Replace Count() == 0 with !Any() so EF Core (or LINQ) can stop after finding the first row instead of counting every row.
    if (!lineItems.Any())
    {
        return ValidationResult.Fail("Invoice must have at least one line item.");
    }

    // CHANGE 2 & 3: Replace Count(predicate) > 0 with Any(predicate) so enumeration stops at the first invalid item rather than scanning every element.
    if (lineItems.Any(li => li.Quantity <= 0))
    {
        return ValidationResult.Fail("All line items must have a positive quantity.");
    }

    // CHANGE 2 & 3: Same fix for unit-price check — Any(predicate) short-circuits on the first negative price.
    if (lineItems.Any(li => li.UnitPrice < 0))
    {
        return ValidationResult.Fail("Unit prices cannot be negative.");
    }

    return ValidationResult.Ok();
}
```

## Explanation

### Issue 1: `Count()` prevents early termination

**Problem:** `lineItems.Count() == 0` tells LINQ (and EF Core's query translator) to count every row in the result set before it can answer the question "are there any rows?". Under load testing this caused a full table scan that retrieved thousands of rows just to confirm the invoice had at least one line item, accounting for the majority of response time.

**Fix:** Replace `lineItems.Count() == 0` with `!lineItems.Any()` at the first guard check (CHANGE 1). `Any()` returns `true` the moment one element is found and abandons the rest of the sequence immediately.

**Explanation:** When EF Core translates `Count()` it emits `SELECT COUNT(*)` (or fetches all rows for LINQ-to-Objects), which requires the database engine to visit every matching row even though the application only needs a boolean answer. `Any()` translates to `SELECT TOP 1` (or `EXISTS`) in SQL, so the database stops as soon as it finds one row and the query returns almost instantly. The difference is especially pronounced on large tables: a 10 000-row invoice dataset makes `Count()` scan 10 000 rows while `Any()` exits after the first. If the sequence is already materialized in memory (e.g. a `List<T>`), the gain is smaller but still real because `Count()` on an `IEnumerable<T>` iterates every element while `Any()` exits after one.

---

### Issue 2: `Count(predicate)` re-enumerates the full sequence

**Problem:** `lineItems.Count(li => li.Quantity <= 0) > 0` applies the predicate to every element in the sequence and tallies a total count, even after it has already found an invalid item. If 1 000 line items exist and the first one has a zero quantity, LINQ still tests all 999 remaining items before returning.

**Fix:** Replace `lineItems.Count(li => li.Quantity <= 0) > 0` with `lineItems.Any(li => li.Quantity <= 0)` (CHANGE 2), and apply the same replacement to the `UnitPrice` check (CHANGE 3). `Any(predicate)` returns `true` immediately on the first element that satisfies the predicate.

**Explanation:** `Count(predicate)` is equivalent to calling `.Where(predicate).Count()` — it must visit every element to produce an accurate count. For a validation check that only needs a yes/no answer, this work is wasted. `Any(predicate)` uses an internal `foreach` with a `return true` on the first match, so in the best case it exits after one comparison. The cost difference scales linearly with sequence length: on a 5 000-row invoice, `Count` performs up to 5 000 predicate evaluations per check while `Any` performs as few as one.

---

### Issue 3: Pattern `Count(...) > 0` obscures intent and disables short-circuit semantics

**Problem:** Using `Count() > 0` (or `Count() == 0`) as a boolean existence test is a common pattern that looks innocuous but is semantically different from `Any()`. Readers have to mentally parse the comparison to understand the intent, and the runtime cannot optimize it the way it can optimize `Any()`.

**Fix:** All three `Count`-based conditions are replaced with `Any()` or `!Any()` (CHANGE 1, CHANGE 2, CHANGE 3), making the intent — "does at least one element satisfy this condition?" — directly readable from the code.

**Explanation:** LINQ providers like EF Core inspect the expression tree to decide what SQL to emit. `Any()` has a well-known translation to `EXISTS (SELECT 1 ...)` or `SELECT TOP 1 ...`, both of which allow the database to use an index and stop scanning immediately. `Count() > 0` may translate to `SELECT COUNT(*) ...`, which forces a full index or table scan even when an `EXISTS` plan would be far cheaper. Beyond performance, expressing existence checks with `Any()` eliminates an entire class of off-by-one errors (e.g. accidentally writing `>= 1` vs `> 0`) and communicates meaning directly without requiring the reader to evaluate the comparison mentally.
