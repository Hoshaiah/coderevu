---
slug: batch-state-update-async
track: javascript
orderIndex: 67
title: Async Handler State Updates Cause Double Render
difficulty: hard
tags:
  - state
  - batching
  - async
  - performance
language: typescript
---

## Context

A checkout component fetches an order summary and then sets both `order` and `loading` state. In React 17, profiling shows the component renders twice in quick succession after the fetch resolves — first with `loading=false, order=null`, then with `loading=false, order={...}` — causing a brief layout flash where the loading spinner disappears before the content appears.

## Buggy code

```typescript
import { useState } from "react";

interface Order {
  id: string;
  total: number;
}

export function Checkout() {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOrder = async () => {
    setLoading(true);
    const data = await fetch("/api/order/latest").then((r) => r.json());
    setLoading(false);
    setOrder(data);
  };

  return (
    <div>
      {loading && <p>Loading…</p>}
      {!loading && !order && <button onClick={fetchOrder}>Fetch Order</button>}
      {order && <p>Order #{order.id}: ${order.total}</p>}
    </div>

  );
}
```
