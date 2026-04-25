## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Stale State in useReducer Callback
// ------------------------------------------------------------------------

interface CartState {
  items: { id: string; price: number; qty: number }[];
  total: number;
}

type CartAction =
  | { type: "ADD_ITEM"; item: { id: string; price: number; qty: number } }
  | { type: "CHECKOUT"; total: number };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM":
      const newItems = [...state.items, action.item];
      return { items: newItems, total: newItems.reduce((s, i) => s + i.price * i.qty, 0) };
    case "CHECKOUT":
      console.log("Submitting checkout for total:", action.total);
      return { items: [], total: 0 };
    default:
      return state;
  }
}

const Cart: React.FC = () => {
  const [state, dispatch] = useReducer(cartReducer, { items: [], total: 0 });

  // CHANGE 1 & 2: Read current total inside a dispatch callback using the functional updater pattern so the callback never closes over stale state, and the dependency array no longer needs state.total at all.
  const handleCheckout = useCallback(() => {
    dispatch((currentState: CartState) => {
      console.log("Submitting checkout for total:", currentState.total);
      return { items: [], total: 0 };
    } as unknown as CartAction);
  }, []);

  return (
    <div>
      <p>Total: ${state.total}</p>
      <CheckoutButton onCheckout={handleCheckout} />
    </div>
  );
};
```

## Explanation

### Issue 1: Stale closure captures initial total

**Problem:** Every time the user adds or removes items the `state.total` in React state updates correctly, and the `<p>Total:</p>` line displays the right number. But when the user clicks Checkout, the console logs `0` (or whatever the total was on first render) and the submitted total is wrong.

**Fix:** Replace the direct dispatch call `dispatch({ type: "CHECKOUT", total: state.total })` with a functional dispatch that reads `currentState.total` from inside the reducer callback, so the value is always fresh at the moment of dispatch.

**Explanation:** `useCallback` with an empty dependency array creates the `handleCheckout` function exactly once, on mount. JavaScript closures capture variable references at creation time, so `state.total` inside that function is permanently bound to the `total` value that existed when the component first rendered — which is `0`. Every subsequent call to `handleCheckout` reads that same stale binding no matter how many times `state` has since been updated. The reducer itself always holds the authoritative current state, so dispatching a function that receives `currentState` as its argument bypasses the closure problem entirely: React calls that function synchronously with the latest state object right before applying the update.

---

### Issue 2: Missing dependency in useCallback array

**Problem:** Even if a developer notices the bug and tries to fix it by adding `state.total` to the `useCallback` dependency array, `CheckoutButton` (wrapped in `React.memo`) would receive a new `handleCheckout` reference on every cart change and re-render unnecessarily. The root problem is that the empty array `[]` is incorrect when the callback reads from `state`.

**Fix:** The functional-dispatch approach introduced in CHANGE 1 means `handleCheckout` no longer reads any external variables, so the dependency array stays `[]` and is now genuinely correct rather than accidentally empty.

**Explanation:** React's `useCallback` only recreates the memoized function when a listed dependency changes. If you use a value from component scope inside the callback but leave it out of the deps array, the linter warns and the behavior is wrong — the old value is silently used. Adding `state.total` to the array would make the value correct but would defeat the memoization goal: `CheckoutButton` would get a new function reference every time an item is added, triggering an otherwise avoidable re-render. Pushing the state read inside a functional dispatch avoids both problems simultaneously: the callback is stable across renders and always operates on current state.
