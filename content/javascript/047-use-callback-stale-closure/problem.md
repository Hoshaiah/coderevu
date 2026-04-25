---
slug: use-callback-stale-closure
track: javascript
orderIndex: 47
title: Stale Closure in useCallback
difficulty: medium
tags:
  - hooks
  - closures
  - react
language: typescript
---

## Context

This component lives in `src/components/ShoppingCart.tsx`. It renders a list of cart items and provides an "Add one more" button for each item. The `onQuantityChange` callback is wrapped in `useCallback` to avoid re-rendering a memoised child list component unnecessarily.

Users report that repeatedly clicking "Add one more" on any item appears to work (the button is responsive), but only the last click actually matters — the quantity jumps to 1 above whatever it was when the component first rendered, regardless of how many times the button was pressed. Refreshing the page shows the correct value from the server.

The team confirmed `onQuantityChange` is called the right number of times by logging inside it. They also verified the parent state update works correctly when called with explicit values from the browser console.

## Buggy code

```typescript
import React, { useState, useCallback } from "react";

interface CartItem {
  id: string;
  name: string;
  quantity: number;
}

interface Props {
  initialItems: CartItem[];
}

export function ShoppingCart({ initialItems }: Props) {
  const [items, setItems] = useState<CartItem[]>(initialItems);

  const handleAddOne = useCallback((itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    setItems(
      items.map((i) =>
        i.id === itemId ? { ...i, quantity: item.quantity + 1 } : i
      )
    );
  }, []);  // empty deps — never re-created

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          {item.name} × {item.quantity}
          <button onClick={() => handleAddOne(item.id)}>Add one more</button>
        </li>
      ))}
    </ul>
  );
}
```
