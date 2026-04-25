---
slug: string-enum-widening
track: javascript
orderIndex: 25
title: Widened String Type Bypasses Enum
difficulty: easy
tags:
  - types
  - typescript
  - narrowing
language: typescript
---

## Context

This code lives in `src/api/createOrder.ts`, a thin wrapper around the orders microservice. The function accepts an order payload from a form submission and forwards it to the REST API. The `status` field is expected to be one of a fixed set of string literals defined by the `OrderStatus` union type.

In production, the API occasionally returns a `400 Bad Request` with the message `"Invalid status value: processing"` even though `"processing"` is clearly a valid status. The bug only surfaces on new orders created through the UI — orders created directly via curl work fine.

The team has already confirmed the network request is being sent with the right-looking payload. They added a `console.log` before the fetch and verified the object looks correct at runtime. The TypeScript compiler reports no errors.

## Buggy code

```typescript
type OrderStatus = "pending" | "processing" | "shipped" | "cancelled";

interface CreateOrderPayload {
  customerId: string;
  items: { productId: string; qty: number }[];
  status: OrderStatus;
}

function buildPayload(formData: FormData): CreateOrderPayload {
  const status = formData.get("status");  // returns FormDataEntryValue | null

  return {
    customerId: formData.get("customerId") as string,
    items: JSON.parse(formData.get("items") as string),
    status: status as unknown as OrderStatus,
  };
}

async function createOrder(formData: FormData): Promise<void> {
  const payload = buildPayload(formData);
  await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```
