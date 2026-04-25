---
slug: session-expose-sensitive-data-error
track: php
orderIndex: 36
title: Sensitive Session Data in Error Log
difficulty: easy
tags:
  - sessions
  - security
  - logging
  - information-disclosure
language: php
---

## Context

This is `src/Checkout/PaymentProcessor.php`, a class that processes credit card transactions by calling a third-party payment gateway. To help with debugging failed payments, the developer added logging around the gateway call that dumps the full context when an exception is thrown.

The operations team noticed that the production error log (which is shipped to a centralized log aggregator accessible to all engineering staff) contains full credit card numbers and CVVs from real customer transactions. The data appears in plain text in log lines tagged `[PaymentProcessor]`.

The developer said: "It only logs on errors, and errors are rare." In production, payment failures occur dozens of times per day, and the log aggregator has no field-level encryption.

## Buggy code

```php
<?php
// src/Checkout/PaymentProcessor.php

class PaymentProcessor
{
    private GatewayClient $gateway;

    public function __construct(GatewayClient $gateway)
    {
        $this->gateway = $gateway;
    }

    public function charge(array $paymentData): array
    {
        // $paymentData contains: card_number, cvv, expiry, amount, currency
        try {
            $response = $this->gateway->authorize($paymentData);
            return ['success' => true, 'transaction_id' => $response['id']];
        } catch (\Exception $e) {
            error_log(
                '[PaymentProcessor] Gateway error: ' . $e->getMessage() .
                ' | Context: ' . json_encode($paymentData)
            );
            return ['success' => false, 'error' => 'Payment failed'];
        }
    }
}
```
