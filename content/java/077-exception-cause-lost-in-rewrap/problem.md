---
slug: exception-cause-lost-in-rewrap
track: java
orderIndex: 77
title: Original Exception Cause Swallowed
difficulty: easy
tags:
  - exceptions
  - error-handling
  - debugging
language: java
---

## Context

`OrderImportService.java` is part of a B2B platform's data ingestion pipeline. It reads CSV rows, parses them into `Order` objects, and persists them via JPA. The class wraps checked exceptions into a custom `ImportException` so callers only deal with unchecked errors.

When a malformed CSV triggers a `ParseException` or a constraint violation triggers a `DataIntegrityViolationException`, support engineers see `ImportException: failed to import order` in Sentry — but the root cause and stack trace are missing entirely. Engineers cannot diagnose the source of the failure without attaching a debugger to production.

The team tried adding more logging around the conversion step but the logs also only captured the message, not the underlying cause.

## Buggy code

```java
import java.text.ParseException;

public class OrderImportService {

    public void importOrder(String[] csvRow) {
        try {
            Order order = parseRow(csvRow);
            persist(order);
        } catch (Exception e) {
            // Wrap in our domain exception so callers don't
            // need to handle infrastructure-level exceptions
            throw new ImportException("failed to import order: " + e.getMessage());
        }
    }

    private Order parseRow(String[] row) throws ParseException {
        // parsing logic
        return new Order();
    }

    private void persist(Order order) {
        // JPA persist
    }

    static class Order {}

    static class ImportException extends RuntimeException {
        ImportException(String message) {
            super(message);
        }
    }
}
```
