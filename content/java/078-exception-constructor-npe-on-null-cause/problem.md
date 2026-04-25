---
slug: exception-constructor-npe-on-null-cause
track: java
orderIndex: 78
title: Exception Constructor Null Cause NPE
difficulty: easy
tags:
  - exceptions
  - nulls
  - error-handling
language: java
---

## Context

This class lives in `src/main/java/com/example/payment/PaymentGateway.java` and wraps calls to an external payment processor. When the processor returns an error code, the service translates it into a domain-specific `PaymentException`. The `fetchErrorDetail` method queries an in-memory lookup table for a human-readable description of the error code, returning `null` for unknown codes.

In production the service throws a `NullPointerException` with no stack trace pointing into payment logic, only into `java.lang.Exception.<init>`. This happens exclusively for unknown error codes from the payment processor — codes that are valid per the external API contract but not yet in the local lookup table.

The team expected that passing a `null` message to the exception constructor would simply produce an exception with a null message, as they had seen this work with the single-argument `new RuntimeException(message)` constructor. They did not realise they were calling a different overload.

## Buggy code

```java
public class PaymentGateway {
    private final ProcessorClient client;
    private final ErrorCodeRegistry registry;

    public PaymentGateway(ProcessorClient client, ErrorCodeRegistry registry) {
        this.client = client;
        this.registry = registry;
    }

    public void charge(String accountId, long amountCents) {
        ProcessorResponse response = client.charge(accountId, amountCents);
        if (!response.isSuccess()) {
            String detail = registry.fetchErrorDetail(response.getErrorCode());
            // detail may be null for unknown error codes
            throw new PaymentException(response.getErrorCode(), detail);
        }
    }
}

class PaymentException extends RuntimeException {
    private final String errorCode;

    public PaymentException(String errorCode, String detail) {
        super(detail, new RuntimeException(detail));
        this.errorCode = errorCode;
    }

    public String getErrorCode() { return errorCode; }
}
```
