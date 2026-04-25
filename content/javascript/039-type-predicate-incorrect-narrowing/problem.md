---
slug: type-predicate-incorrect-narrowing
track: javascript
orderIndex: 39
title: Wrong Type Predicate Passes Bad Data
difficulty: medium
tags:
  - types
  - security
  - correctness
language: typescript
---

## Context

This validation module lives in `src/api/validators/webhookPayload.ts`. The application receives webhook payloads from a payment processor and uses a type guard to decide whether to pass the payload to the order fulfillment pipeline. The function is called in an Express middleware before the handler touches the data.

In staging, the team observed that a malformed payload missing the required `amount` field was accepted and forwarded to the fulfillment handler, causing a downstream crash when the handler tried to call `.toFixed(2)` on `undefined`. The crash is intermittent because most real payloads are well-formed.

Code review showed that the type guard function passes TypeScript compilation with no errors and no `any` casts, which gave the team false confidence that it was correct.

## Buggy code

```typescript
interface WebhookPayload {
  orderId: string;
  amount: number;
  currency: string;
  status: 'paid' | 'failed' | 'refunded';
}

function isWebhookPayload(value: unknown): value is WebhookPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['orderId'] === 'string' &&
    typeof v['currency'] === 'string' &&
    typeof v['status'] === 'string'
  );
}

export function processWebhook(raw: unknown) {
  if (!isWebhookPayload(raw)) {
    throw new Error('Invalid webhook payload');
  }
  // TypeScript thinks `raw` is WebhookPayload here
  const total = raw.amount.toFixed(2);
  return { orderId: raw.orderId, total };
}
```
