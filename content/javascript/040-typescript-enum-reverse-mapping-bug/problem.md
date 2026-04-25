---
slug: typescript-enum-reverse-mapping-bug
track: javascript
orderIndex: 40
title: Enum Reverse Mapping Unexpected Key
difficulty: medium
tags:
  - types
  - correctness
  - typescript
language: typescript
---

## Context

This code lives in `src/models/orderStatus.ts` and `src/api/ordersController.ts`. The application uses a TypeScript numeric enum to represent order states. A utility function iterates over `Object.keys(OrderStatus)` to build a list of valid status names for input validation — specifically to reject any incoming status string that isn't a recognized value.

Ops reported that the validation is rejecting all status update requests with a 400 error, even for strings like `'Pending'` that are clearly valid enum members. Adding a debug log inside the validator shows the `validStatuses` array contains entries like `['0', '1', '2', '3', 'Pending', 'Processing', 'Shipped', 'Delivered']` — numeric strings mixed in with the names.

The team confirmed the enum definition hasn't changed and the values being sent from the client are correct (e.g., `'Pending'`). The validator was working in an older version of the code that used a string union type instead of the enum.

## Buggy code

```typescript
enum OrderStatus {
  Pending = 0,
  Processing = 1,
  Shipped = 2,
  Delivered = 3,
}

function getValidStatuses(): string[] {
  return Object.keys(OrderStatus);
}

function validateStatus(input: string): boolean {
  const valid = getValidStatuses();
  return valid.includes(input);
}

// In the controller:
app.put('/orders/:id/status', (req, res) => {
  const { status } = req.body; // e.g. "Pending"
  if (!validateStatus(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  // ...
});
```
