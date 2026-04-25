## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Two state updates inside an async handler cause two separate re-renders instead of one
// ------------------------------------------------------------------------
import { useState } from "react";
import { unstable_batchedUpdates } from "react-dom";

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
    // CHANGE 1: Wrap both state updates in unstable_batchedUpdates so React 17 processes them together in a single render instead of two separate renders.
    // CHANGE 2: Set order before setting loading=false so no intermediate state exists where loading is false but order is still null.
    unstable_batchedUpdates(() => {
      setOrder(data);
      setLoading(false);
    });
  };

  return (
    <div>
      {loading && <p>Loading\u2026</p>}
      {!loading && !order && <button onClick={fetchOrder}>Fetch Order</button>}
      {order && <p>Order #{order.id}: ${order.total}</p>}
    </div>
  );
}
```

## Explanation

### Issue 1: Unbatched state updates after async/await

**Problem:** After the `await` resolves, calling `setLoading(false)` and `setOrder(data)` as two separate statements causes React 17 to schedule two distinct re-renders. The component renders once with `loading=false, order=null`, then again with `loading=false, order={...}`. The user sees the spinner disappear and then a blank gap before the order content appears.

**Fix:** Both calls are moved inside `unstable_batchedUpdates(() => { ... })` imported from `react-dom`. This wraps the two `setState` calls at the `CHANGE 1` site so React treats them as a single update batch and produces only one re-render.

**Explanation:** React 17 automatically batches state updates that originate from synchronous event handlers, but it does not batch updates that occur after an `await` — those resume in a plain microtask callback outside React's event system. Each `setState` call in that context triggers its own synchronous flush. `unstable_batchedUpdates` tells React to collect all state updates that happen inside the callback and commit them together in one render pass. React 18 solves this automatically with automatic batching everywhere, but in React 17 you need the explicit wrapper. The `unstable_` prefix indicates it is a low-level API, but it is widely used and stable in practice for exactly this scenario.

---

### Issue 2: Wrong order of state updates creates a blank intermediate state

**Problem:** The original code calls `setLoading(false)` before `setOrder(data)`. Even if only one render were produced, this ordering creates a logical intermediate state where `loading` is `false` and `order` is still `null`. The render logic shows neither the spinner nor the order content during that state — the button reappears briefly.

**Fix:** At the `CHANGE 2` site inside the `unstable_batchedUpdates` callback, `setOrder(data)` is called before `setLoading(false)`, so if React were to snapshot state between the two calls, `order` would already be populated when `loading` becomes `false`.

**Explanation:** The component's JSX has three mutually exclusive branches: show spinner when `loading` is true, show the fetch button when `loading` is false and `order` is null, and show order content when `order` is set. Setting `loading=false` first drops into the middle branch (button visible) for one render, then the next render sets `order` and switches to the third branch. Reversing the order means that when `loading` finally becomes `false`, `order` is already non-null, so the render goes directly to the order-content branch with no intermediate button flash. When combined with batching from Issue 1, both updates are committed atomically and the ordering still matters as a defensive practice — if batching ever fails or is bypassed, the safer order avoids the blank state.
