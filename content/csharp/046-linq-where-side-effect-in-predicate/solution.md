## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Mutating State Inside LINQ Predicate
// ------------------------------------------------------------------------

public class InvoiceExporter
{
    private readonly BillingDbContext _db;

    public InvoiceExporter(BillingDbContext db)
    {
        _db = db;
    }

    public List<Invoice> GetAndMarkUnexported()
    {
        // CHANGE 1: Separate filtering from mutation — first materialise the filtered list with ToList(), then mutate in a plain foreach so every object in the list is marked exactly once with no enumeration side-effects.
        var toExport = _db.Invoices
            .Where(i => i.ExportedAt == null && i.IssuedAt <= DateTime.UtcNow.AddDays(-1))
            .ToList();

        // CHANGE 2: Mutation is now an explicit foreach over the already-materialised list, completely decoupled from the filtering predicate, guaranteeing every selected invoice is marked.
        foreach (var invoice in toExport)
        {
            invoice.ExportedAt = DateTime.UtcNow;
        }

        _db.SaveChanges();
        return toExport;
    }
}
```

## Explanation

### Issue 1: Deferred mutation inside Where predicate

**Problem:** Every other invoice appears to have its `ExportedAt` timestamp set in the database, but only roughly half the selected invoices are actually persisted as exported. The nightly job reports the correct count but production data shows gaps.

**Fix:** Remove the `.AsEnumerable().Where(invoice => { invoice.ExportedAt = ...; return true; })` chain entirely. Replace it with a `.ToList()` that materialises the filtered results from EF, followed by a plain `foreach` loop (the CHANGE 2 site) that sets `ExportedAt` on every element in the list.

**Explanation:** LINQ operators like `Where` use deferred execution — the delegate runs lazily as elements are pulled through the pipeline. When `ToList()` drives the iteration, each element passes through the mutating `Where` predicate exactly once, which sounds safe, but the mutation and the "return value" of the predicate are coupled inside the same delegate. If the EF query provider or any future LINQ operator (such as `Take`, `Distinct`, or even a second `Where` added by a code reviewer) re-evaluates or short-circuits the sequence, the mutation can fire a different number of times than elements end up in the final list. In the original code the `.AsEnumerable()` call does prevent the database from seeing the predicate, but the real hazard is conceptual: `Where` is a filter, not a `ForEach`. Any refactor that inserts another operator between the mutating `Where` and `ToList()` can silently break the invariant that every returned invoice was marked. Separating the two concerns — filter first, then mutate the materialised list — eliminates all of these failure modes.

---

### Issue 2: Semantic misuse of Where for side effects

**Problem:** A developer reading the code sees a `Where` predicate that always returns `true` and contains a mutation. This hides intent, makes code review harder, and means any future change to the filtering logic (such as adding a real filter condition that returns `false` for some items) would silently stop marking those items even though the caller expects all returned invoices to be marked.

**Fix:** The mutating `Where` predicate and the `.AsEnumerable()` call are deleted. A separate `foreach` loop at the CHANGE 2 site explicitly iterates `toExport` and sets `ExportedAt`, making the mutation visible and unconditional for every invoice in the result set.

**Explanation:** `Where` communicates "keep elements that satisfy a condition". When a developer puts a state-changing statement inside that delegate, the mutation becomes invisible to anyone scanning the method for where objects are modified. More concretely, if someone later changes `return true` to a real condition (say, skipping invoices above a certain amount), the mutation stops firing for those skipped invoices even though the caller's contract says all returned invoices are marked. A `foreach` makes the mutation explicit and independent of filtering, so changing the filter never accidentally suppresses the marking step.
