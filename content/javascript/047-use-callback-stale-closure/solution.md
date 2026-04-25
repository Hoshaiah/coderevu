## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Stale Closure in useCallback
// ------------------------------------------------------------------------

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

  // CHANGE 1: Remove items from the closure entirely by using the functional form of setItems, so useCallback never needs to re-capture items.
  // CHANGE 2: Use a setState updater function that receives the latest state snapshot (prevItems) instead of the stale closed-over items array.
  const handleAddOne = useCallback((itemId: string) => {
    setItems((prevItems) =>
      prevItems.map((i) =>
        i.id === itemId ? { ...i, quantity: i.quantity + 1 } : i
      )
    );
  }, []);  // safe to keep empty deps now — no external variables captured

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

## Explanation

### Issue 1: Stale closure captures initial items array

**Problem:** Every click of "Add one more" appears to work, but the quantity only ever reaches `initialQuantity + 1` no matter how many times the user clicks. Subsequent clicks after the first are silently no-ops in terms of visible effect.

**Fix:** The `items` variable is removed from `handleAddOne`'s closure entirely. Instead of reading `items` inside the callback, the fix passes a state updater function to `setItems` (see CHANGE 1 and CHANGE 2), so the callback no longer needs access to the current `items` array at all, making the empty dependency array safe.

**Explanation:** `useCallback` with an empty `[]` dependency array creates the callback exactly once — on mount — and the function it returns closes over the value of `items` at that moment. Every subsequent render produces a new `items` array in the component's scope, but `handleAddOne` still points to the original one. So when the user clicks, `item.quantity` is always the initial quantity, and `setItems` writes `initialQuantity + 1` each time, overwriting any progress. The symptom is consistent: after N clicks the quantity shows as `initialQuantity + 1` on the next render, not `initialQuantity + N`. A related pitfall is adding `items` to the dependency array to fix the staleness — that works but defeats memoisation because `items` changes on every state update, causing the callback and the memoised child to re-render on every keystroke.

---

### Issue 2: setItems called with stale snapshot instead of updater function

**Problem:** Even if the dependency array were populated correctly, calling `setItems(items.map(...))` computes the next state from whatever value of `items` was captured when the callback last ran, not from the value React has at the moment it processes the update. Under fast clicking or concurrent rendering, updates can be dropped.

**Fix:** Replace `setItems(items.map(...))` with `setItems((prevItems) => prevItems.map(...))` (CHANGE 2). The updater form receives the guaranteed-latest state as `prevItems`, so the new state is always derived from the true current value regardless of when the callback was created or when React schedules the update.

**Explanation:** React batches state updates and may process them asynchronously. When you call `setItems(newArray)`, `newArray` is computed immediately from whatever `items` your closure holds. If two clicks fire before React processes either update, both calls compute `newArray` from the same stale base, and the second write clobbers the first — a lost update. When you pass an updater function `(prev) => ...`, React calls it with the output of the previous update in the queue, so each update chains correctly onto the last. This is the standard pattern any time the new state depends on the old state, and it is especially important inside memoised callbacks that may be called multiple times before re-rendering.
