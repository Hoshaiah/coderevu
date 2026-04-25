## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Where Closure Captures Mutable Outer Variable
// ------------------------------------------------------------------------

public IEnumerable<Product> ApplyFilters(
    IEnumerable<Product> products,
    List<FilterRule> rules)
{
    var query = products.AsEnumerable();

    for (int i = 0; i < rules.Count; i++)
    {
        // CHANGE 1: Declare `currentRule` inside the loop body so each iteration gets its own variable; the lambda captures this local copy instead of the shared outer `rule`.
        FilterRule currentRule = rules[i];
        // CHANGE 2: Reference `currentRule` (the loop-local variable) instead of the outer `rule` so each predicate closes over a distinct, immutable binding.
        query = query.Where(p => currentRule.Field == "Price"
            ? p.Price <= currentRule.Threshold
            : p.StockLevel >= (int)currentRule.Threshold);
    }

    return query.ToList();
}
```

## Explanation

### Issue 1: Closure Captures Shared Loop Variable

**Problem:** Every predicate lambda captures the same `rule` variable rather than the value it held at the time the lambda was created. When the query is finally enumerated by `ToList()`, all lambdas read whatever value `rule` holds at that point — which is the last element assigned during the loop. Products end up filtered using only the last rule's field and threshold for every filter in the chain.

**Fix:** Move the variable declaration inside the loop body and rename it `currentRule`. Each iteration now declares a fresh local variable. The lambda for that iteration closes over `currentRule` — a reference to the CHANGE 1/CHANGE 2 local — which is never overwritten by subsequent iterations.

**Explanation:** C# closures capture variables, not values. When `rule` is declared outside the loop, there is exactly one `rule` slot in memory. Every lambda's closure holds a pointer to that same slot. The loop overwrites that slot on each iteration, so by the time `ToList()` forces evaluation, all pointers lead to the last-written value. Moving the declaration inside the loop (`FilterRule currentRule = rules[i]`) creates a new slot per iteration. Each lambda's closure points to a different slot, and no subsequent code touches those slots, so each predicate retains the correct field and threshold. A related pitfall: using `foreach` instead of `for` had the same problem in C# prior to version 5 because the `foreach` iteration variable was also declared once outside the loop; C# 5 fixed that, but `for`-loop variables are still shared.

---

### Issue 2: Variable Declared Outside Loop Scope

**Problem:** `FilterRule rule;` appears before the loop, making it a single variable shared across all iterations. Even if the lambda text is correct, all lambdas refer to this one binding, producing wrong results whenever evaluation is deferred past the end of the loop.

**Fix:** Remove the outer `FilterRule rule;` declaration entirely. Declare `FilterRule currentRule = rules[i];` as the first statement inside the loop body (CHANGE 1), limiting its scope to a single iteration.

**Explanation:** Scope determines how many distinct storage locations back a variable name. A variable declared outside the loop has one location for the entire method lifetime. A variable declared inside the loop body has one location per execution of that block — effectively one per iteration. Because LINQ `Where` builds a lazy pipeline and defers execution until `ToList()`, all the lambdas run after the loop completes. At that point the outer `rule` slot holds only the last-assigned value. Scoping the variable inside the loop is both the minimal fix and the idiomatic C# pattern for this situation; it makes the intent (one rule per predicate) visible in the code structure itself.
