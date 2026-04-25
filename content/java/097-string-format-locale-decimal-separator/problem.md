---
slug: string-format-locale-decimal-separator
track: java
orderIndex: 97
title: String.format Locale-Dependent Decimal Separator
difficulty: medium
tags:
  - correctness
  - exceptions
  - nulls
language: java
---

## Context

This formatting helper lives at `src/main/java/com/example/payment/AmountFormatter.java`. It formats monetary amounts as strings before writing them to a CSV file that is consumed by a downstream payment processor. The processor expects values like `"12.50"` with a period as the decimal separator.

The service works correctly on developer laptops and the CI server (all configured with `en_US` locale), but fails on production servers deployed in Germany, where the default JVM locale is `de_DE`. The payment processor rejects the CSV rows, and payments fail silently. The error appears in the payment processor's rejection log as `"invalid amount format: 12,50"`.

The team has confirmed the numeric values are correct; only the formatting is wrong. They tried `String.valueOf(amount)` as an alternative, but that sometimes produces scientific notation for small values.

## Buggy code

```java
public class AmountFormatter {

    public String formatAmount(double amount) {
        return String.format("%.2f", amount);
    }

    public String buildCsvRow(String reference, double amount, String currency) {
        return String.format("%s,%s,%s", reference, formatAmount(amount), currency);
    }
}
```
