## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — SelectMany Produces Cartesian Product
// ------------------------------------------------------------------------

public IReadOnlyList<LineItemReport> BuildReport(
    IReadOnlyList<Order> orders,
    IReadOnlyList<Customer> customers)
{
    // CHANGE 1+2: Build a lookup by CustomerId so each order joins its own customer instead of cross-joining every customer, eliminating the Cartesian product.
    var customerById = customers.ToDictionary(c => c.Id);

    var report = orders.SelectMany(order =>
        // CHANGE 1+2: Look up the single matching customer rather than SelectMany-ing over all customers; this replaces the two-level SelectMany that produced O(orders * customers * lineItems) rows.
        order.LineItems.Select(li =>
        {
            var customer = customerById[order.CustomerId];
            return new LineItemReport
            {
                OrderId = order.Id,
                CustomerId = customer.Id,
                CustomerName = customer.Name,
                ProductId = li.ProductId,
                Quantity = li.Quantity,
                UnitPrice = li.UnitPrice
            };
        }));

    return report.ToList();
}
```

## Explanation

### Issue 1: Cartesian Product From Nested SelectMany

**Problem:** The report produces `orders.Count × customers.Count × lineItems.Count` rows instead of one row per line item. With 1 000 orders and 500 customers each averaging 5 line items, the output has 2 500 000 rows instead of 5 000. The billing team sees massively inflated invoice totals because every line item is repeated once per customer in the system.

**Fix:** Replace the outer `customers.SelectMany(...)` with a `Dictionary<int, Customer>` lookup (`customerById`) built via `customers.ToDictionary(c => c.Id)`, then call `customerById[order.CustomerId]` inside a single `order.LineItems.Select(...)`. This collapses the two-level `SelectMany` into one level.

**Explanation:** LINQ's `SelectMany` flattens the sequence returned by its projection. When the projection returns all customers for every order, LINQ emits every (order, customer) combination before even reaching the line items — that is the definition of a Cartesian product. The staging environment hid the bug because it had exactly one customer, making `1 × 1 × lineItems` indistinguishable from the correct result. A `Dictionary` lookup costs O(1) per order and guarantees each order is paired with exactly one customer. If an order references a `CustomerId` that does not exist in the dictionary, `customerById[order.CustomerId]` throws a `KeyNotFoundException` immediately, which is easier to diagnose than silent data corruption.

---

### Issue 2: No Join Predicate Matching Order to Its Customer

**Problem:** Even setting aside row count, the data in each report row is wrong: a given order line item gets paired with customers it does not belong to. An order placed by customer A appears in the report attributed to customers B, C, D, and so on, so the `CustomerId` and `CustomerName` fields are meaningless.

**Fix:** Add `order.CustomerId` as the join key and retrieve the customer with `customerById[order.CustomerId]` so the report row is always populated with the customer who owns that specific order, not an arbitrary customer from the collection.

**Explanation:** The original code never compares any field of `order` to any field of `customer`. Both `SelectMany` calls are independent iterations, so there is no relationship enforced between the two. A correct join requires a condition — either a LINQ `join` clause, a `Where` filter, or a dictionary lookup — that ties `order.CustomerId` to `customer.Id`. Using a pre-built `Dictionary` is preferred over a `Where` inside the projection because `Where` would still scan all customers for each order (O(n²) per line item), while the dictionary lookup is O(1). A related pitfall is using `FirstOrDefault` with a predicate instead of a dictionary: it works correctly but degrades to O(orders × customers) and becomes slow at scale.
