---
slug: date-tolocaledatestring-timezone-shift
track: javascript
orderIndex: 29
title: Date Shifted by UTC Offset
difficulty: easy
tags:
  - types
  - correctness
  - date-handling
language: typescript
---

## Context

This helper lives in `src/utils/formatDate.ts` and is used across a booking application to display reservation dates. Dates are stored in the database as ISO 8601 date-only strings like `"2024-07-15"` and are sent to the frontend as-is via a REST API.

Users in UTC-4 through UTC-12 timezones consistently report that dates shown in the UI are one day earlier than their actual reservation date. A booking for July 15 appears as July 14. Users in UTC+0 and later do not see the problem. The bug has triggered customer support tickets and chargebacks.

The team checked that the API response is correct — the raw string `"2024-07-15"` arrives in the browser intact. The bug is purely in the display layer.

## Buggy code

```typescript
export function formatReservationDate(isoDateString: string): string {
  // isoDateString is a date-only string, e.g. "2024-07-15"
  const date = new Date(isoDateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
```
