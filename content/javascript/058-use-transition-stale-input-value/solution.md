## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Stale Input Inside useTransition
// ------------------------------------------------------------------------

import React, { useState, useTransition } from "react";

interface Product {
  id: number;
  name: string;
}

const allProducts: Product[] = [
  { id: 1, name: "Widget A" },
  { id: 2, name: "Gadget B" },
  { id: 3, name: "Widget C" },
];

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>(allProducts);
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);

    startTransition(() => {
      // CHANGE 1: Use the locally captured `value` variable instead of the `query` state variable so the transition always filters with the value the user just typed, not the stale state from the previous render.
      const filtered = allProducts.filter((p) =>
        p.name.toLowerCase().includes(value.toLowerCase())
      );
      setResults(filtered);
    });
  }

  return (
    <div>
      <input value={query} onChange={handleChange} placeholder="Search..." />
      {isPending && <span>Loading...</span>}
      <ul>
        {results.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Explanation

### Issue 1: Stale `query` State Inside Transition Closure

**Problem:** After typing quickly, the results list lags behind by one or more characters. The console logs inside the transition show a query string that belongs to a previous keystroke, not the one the user just typed.

**Fix:** Replace `query` with `value` inside the `startTransition` callback at the filter call — `p.name.toLowerCase().includes(value.toLowerCase())`. `value` is the local variable captured from `e.target.value` at the top of `handleChange`.

**Explanation:** When `handleChange` runs, `setQuery(value)` schedules a state update, but React does not apply that update synchronously — `query` still holds the value from the previous render for the remainder of the current event handler. The `startTransition` callback is a closure that closes over `query` at the time `handleChange` executes, so it always reads one render behind. By contrast, `value` is a plain local variable assigned right from the event object, so it always holds what the user actually typed. Using `value` inside the transition makes the filter consistent with the input field on every keystroke. A related pitfall: the same staleness would occur if you tried to read `query` in a `useEffect` without listing it correctly in the dependency array — always prefer the freshest local variable or a ref when you need the current value synchronously.

---

### Issue 2: First-Render and Fast-Typing Results Reflect Wrong Query

**Problem:** On the very first keystroke, and whenever the user types faster than React can commit state updates, the results panel shows items that match the previous query rather than the current one. The input field looks correct but the list does not match it.

**Fix:** This is resolved by the same `value`-instead-of-`query` substitution at `CHANGE 1`. There is no separate code change required, but the mechanism is distinct enough to call out explicitly.

**Explanation:** `useTransition` intentionally defers the work inside `startTransition` so that the input stays responsive. During that deferral window, if another keystroke arrives before the transition commits, React may run the transition callback while `query` has already been updated to an even newer value — or React may batch the callbacks in an order where the state seen by the closure is two or more steps stale. Because `value` is captured fresh from the DOM event each time `handleChange` is called, every scheduled transition closure carries its own correct snapshot of what the user typed. Each transition therefore computes results for exactly its own keystroke, and whichever one React commits last will be the most recent one, giving correct final output even under rapid input.
