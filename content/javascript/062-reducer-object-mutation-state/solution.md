## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Direct State Mutation in Reducer
// ------------------------------------------------------------------------

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: 'ADD_ITEM'; item: Omit<CartItem, 'quantity'> }
  | { type: 'REMOVE_ITEM'; productId: string }
  | { type: 'CLEAR_CART' };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(
        (i) => i.productId === action.item.productId
      );
      if (existing) {
        // CHANGE 1: Replace the mutated item with a new object so React detects the change via reference equality.
        // CHANGE 2: Return a new CartState object with a new items array so useReducer sees a different reference and schedules a re-render.
        return {
          items: state.items.map((i) =>
            i.productId === action.item.productId
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        };
      }
      return {
        items: [...state.items, { ...action.item, quantity: 1 }],
      };
    }
    case 'REMOVE_ITEM':
      return {
        items: state.items.filter((i) => i.productId !== action.productId),
      };
    case 'CLEAR_CART':
      return { items: [] };
    default:
      return state;
  }
}
```

## Explanation

### Issue 1: Direct mutation of CartItem object

**Problem:** When a product already exists in the cart, the reducer writes `existing.quantity += 1` directly onto the object inside `state.items`. React's `useReducer` (and the `useMemo` that computes the total) both rely on reference equality to detect changes. Because the `CartItem` object's reference never changes, memoized selectors see no difference and the UI can appear stale — the total does not update even though the underlying data has changed.

**Fix:** Replace the `existing.quantity += 1` mutation and the `return state` with a `state.items.map(...)` call that produces a brand-new `CartItem` object — `{ ...i, quantity: i.quantity + 1 }` — for the matching item and leaves all other items untouched.

**Explanation:** JavaScript objects are compared by reference, not by value. When you mutate `existing.quantity`, the object sitting in the array is the same pointer it was before. Any code that checks "did this object change?" — including React's reconciler and `useMemo` — sees the same reference and concludes nothing changed. Spreading the item into a new object (`{ ...i, quantity: i.quantity + 1 }`) allocates a fresh object with a new reference, so every equality check correctly reports a change. A related pitfall: nested objects inside the spread are still shared references, so if `CartItem` ever gains a nested object property you would need to deep-clone that property too.

---

### Issue 2: Returning unchanged state reference after mutation

**Problem:** After mutating `existing.quantity`, the original code returns the same `state` object. `useReducer` compares the returned value to the previous state using `Object.is`. Because it is the exact same reference, React bails out of the re-render entirely. The inconsistency users see on fast repeated clicks is a timing artifact: occasionally the component re-renders for an unrelated reason and happens to display the already-mutated data, making the bug appear intermittent.

**Fix:** The `return state` line is removed. The new `map`-based branch returns a fresh `{ items: [...] }` object, which gives `useReducer` a new top-level reference and guarantees a re-render is scheduled.

**Explanation:** `useReducer` uses `Object.is` on the reducer's return value. If the same object comes back, React skips re-rendering the component and skips re-running any `useMemo` that depends on that state. Returning a new object — even if its contents are structurally identical — is the signal React needs to process the update. This is why the immutability contract in React state management is non-negotiable: the framework has no way to diff deeply nested structures on every dispatch, so it trusts the reducer author to signal changes through new references.
