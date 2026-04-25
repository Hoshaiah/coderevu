---
slug: string-switch-null-input-npe
track: java
orderIndex: 60
title: Null Input to String Switch NPE
difficulty: easy
tags:
  - nulls
  - exceptions
  - collections
language: java
---

## Context

This file is `src/main/java/com/example/billing/InvoiceRouter.java`. It routes incoming invoices to different processors based on the invoice type string that arrives from an external JSON API. The external API occasionally omits the `type` field entirely, in which case the deserialized object has a null `type`.

In production the service throws `NullPointerException` with a stack trace pointing into the `route()` method approximately once per hour, always correlated with requests from a specific upstream partner that frequently omits the `type` field. The NPE causes the entire invoice to be dropped without a retry.

The team already added a null check on the outer `Invoice` object, assuming the whole payload was null. After that change the NPE persisted, so they know the `Invoice` object itself is non-null.

## Buggy code

```java
public class InvoiceRouter {

    public Processor route(Invoice invoice) {
        switch (invoice.getType()) {
            case "STANDARD":
                return new StandardProcessor();
            case "CREDIT":
                return new CreditProcessor();
            case "RECURRING":
                return new RecurringProcessor();
            default:
                throw new IllegalArgumentException(
                    "Unknown invoice type: " + invoice.getType());
        }
    }
}
```
