---
slug: nullpointerexception-on-map-unbox
track: java
orderIndex: 56
title: Null Unboxing from Map Get
difficulty: easy
tags:
  - nulls
  - collections
  - exceptions
language: java
---

## Context

This code lives in `src/main/java/com/example/billing/InvoiceCalculator.java`, part of a billing service that computes per-user totals from a frequency map built earlier in the pipeline. The map tracks how many times each user ID appeared in a batch of billing events during a nightly ETL job.

The job runs successfully for most batches, but occasionally a `NullPointerException` is thrown with a stack trace pointing to the line that performs the multiplication. The failure only occurs for certain user IDs, and the logs show that those IDs are not present in the `counts` map. The team initially thought the code was defensive because the multiplication expression looks like a simple integer operation.

## Buggy code

```java
import java.util.Map;

public class InvoiceCalculator {
    private static final int UNIT_PRICE_CENTS = 150;

    public long calculateTotal(Map<String, Integer> counts, String userId) {
        // Multiply event count by unit price to get total in cents
        int count = counts.get(userId);
        return (long) count * UNIT_PRICE_CENTS;
    }
}
```
