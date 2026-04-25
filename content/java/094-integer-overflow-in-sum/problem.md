---
slug: integer-overflow-in-sum
track: java
orderIndex: 94
title: Summing large order values silently overflows and returns a wrong total
difficulty: easy
tags:
  - arithmetic
  - overflow
  - correctness
language: java
---

## Context

This billing service aggregates order line totals to compute an invoice grand total. In QA, invoices with many high-value items occasionally produce a negative grand total, causing automated payment checks to reject valid orders.

The values come from a database column typed as `BIGINT`, which the JDBC layer maps to `long`. The issue is not in the database — everything looks correct there.

## Buggy code

```java
import java.util.List;

public class InvoiceCalculator {

    public long grandTotal(List<Long> lineTotals) {
        int sum = 0;
        for (long amount : lineTotals) {
            sum += amount;
        }
        return sum;
    }
}
```
