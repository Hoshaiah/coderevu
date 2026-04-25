---
slug: discriminated-union-missing-never-check
track: javascript
orderIndex: 38
title: Unexhaustive Union Without Never Guard
difficulty: medium
tags:
  - types
  - correctness
  - typescript
language: typescript
---

## Context

This module lives in `src/notifications/render.ts` and is responsible for turning a `Notification` union type into an HTML string for an email template renderer. The codebase uses strict TypeScript and the team prides itself on type-safe exhaustive switches.

A new notification type, `"payment_failed"`, was added to the `Notification` union six months ago but was never added to the switch statement in `renderNotification`. Because there is no exhaustive check, TypeScript emits no error, and `renderNotification` silently returns `undefined` for payment failure notifications. The email service then sends blank emails to customers.

Greppping for `payment_failed` shows it is correctly handled in the backend event router — only this rendering function was missed. The team wants a compile-time guarantee that adding a new variant without updating `renderNotification` produces a type error.

## Buggy code

```typescript
type AccountCreated = { kind: "account_created"; username: string };
type PasswordReset = { kind: "password_reset"; resetLink: string };
type OrderShipped = { kind: "order_shipped"; trackingNumber: string };
type PaymentFailed = { kind: "payment_failed"; amount: number; currency: string };

type Notification = AccountCreated | PasswordReset | OrderShipped | PaymentFailed;

function renderNotification(n: Notification): string {
  switch (n.kind) {
    case "account_created":
      return `Welcome, ${n.username}! Your account is ready.`;
    case "password_reset":
      return `Reset your password: ${n.resetLink}`;
    case "order_shipped":
      return `Your order is on its way! Tracking: ${n.trackingNumber}`;
    // payment_failed was never added
  }
}
```
