---
slug: null-check-after-dereference
track: java
orderIndex: 65
title: Null Checked After Dereference
difficulty: easy
tags:
  - nulls
  - exceptions
  - correctness
language: java
---

## Context

`InvoiceValidator.java` validates incoming invoice payloads before they are persisted. It is called synchronously from a REST controller. The method is supposed to return a validation error message when the line-item list is null or empty, and `null` when validation passes.

Some customers report their invoice submissions fail with a `NullPointerException` at the validator, even when the payload looks well-formed to them. The error appears in the controller's 500-error handler rather than producing a 400 validation error as intended. Log correlation shows it always happens for invoices where `lineItems` is `null`.

A code reviewer signed off on this method because the null check is present — they didn't notice its position relative to the dereference.

## Buggy code

```java
import java.util.List;

public class InvoiceValidator {

    public String validate(Invoice invoice) {
        if (invoice == null) {
            return "Invoice must not be null";
        }

        List<LineItem> items = invoice.getLineItems();
        // Check size before checking for null — NPE if items is null
        if (items.size() == 0 || items == null) {
            return "Invoice must have at least one line item";
        }

        if (invoice.getTotalAmount() <= 0) {
            return "Invoice total must be positive";
        }

        return null; // valid
    }

    interface Invoice {
        List<LineItem> getLineItems();
        double getTotalAmount();
    }

    interface LineItem {}
}
```
