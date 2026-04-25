---
slug: linq-selectmany-cartesian-product
track: csharp
orderIndex: 62
title: SelectMany Produces Cartesian Product
difficulty: medium
tags:
  - linq
  - correctness
  - data-processing
language: csharp
---

## Context

This code is in `Reports/OrderSummaryBuilder.cs` and builds a flat list of order line items enriched with customer information for a monthly billing report. It pulls orders and customers from two pre-loaded in-memory collections and joins them before writing the report CSV.

The billing team reports that the monthly report contains wildly inflated row counts — some months show hundreds of thousands of rows when only a few thousand orders were placed. Invoices generated from the report are being sent with incorrect totals, causing customer complaints. The issue was not caught in staging because the test data only had one customer.

The developer verified that the input collections contain the correct number of records and that no duplicates exist in the source data.

## Buggy code

```csharp
public IReadOnlyList<LineItemReport> BuildReport(
    IReadOnlyList<Order> orders,
    IReadOnlyList<Customer> customers)
{
    var report = orders.SelectMany(order =>
        customers.SelectMany(customer =>
            order.LineItems.Select(li => new LineItemReport
            {
                OrderId = order.Id,
                CustomerId = customer.Id,
                CustomerName = customer.Name,
                ProductId = li.ProductId,
                Quantity = li.Quantity,
                UnitPrice = li.UnitPrice
            })));

    return report.ToList();
}
```
