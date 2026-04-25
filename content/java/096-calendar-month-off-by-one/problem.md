---
slug: calendar-month-off-by-one
track: java
orderIndex: 96
title: >-
  java.util.Calendar month is zero-indexed, causing date comparisons to be off
  by one month
difficulty: medium
tags:
  - correctness
  - date-time
  - api-misuse
language: java
---

## Context

A subscription billing job checks whether a customer's trial period has expired. It builds an expiry date from stored year/month/day integers and compares it to today. In production, customers' trials are expiring one month late — a subscriber who signed up in January is billed as if their expiry were in February.

The code works correctly for December (month 12 wraps to January of the next year for a different reason), which made the bug hard to spot in year-end testing.

## Buggy code

```java
import java.util.Calendar;
import java.util.Date;

public class TrialExpiryChecker {

    public boolean isExpired(int year, int month, int day) {
        Calendar expiry = Calendar.getInstance();
        expiry.set(year, month, day, 0, 0, 0);
        expiry.set(Calendar.MILLISECOND, 0);

        Calendar now = Calendar.getInstance();
        return !now.before(expiry);
    }
}
```
