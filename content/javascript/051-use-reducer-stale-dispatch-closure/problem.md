---
slug: use-reducer-stale-dispatch-closure
track: javascript
orderIndex: 51
title: Stale State in useReducer Callback
difficulty: medium
tags:
  - hooks
  - closures
  - react
language: typescript
---

## Context

This component lives in `src/components/Cart.tsx` and manages a shopping cart with `useReducer`. A `handleCheckout` callback is passed down to a child `<CheckoutButton>` component wrapped in `React.memo`. To avoid unnecessary re-renders of the expensive child, `handleCheckout` is wrapped in `useCallback` with an empty dependency array.

Users occasionally report that clicking "Checkout" submits the wrong cart total — specifically the total that was correct when the component first mounted, not the current one. The bug only appears when items are added or removed from the cart after the initial render and then checkout is clicked without any other interaction that would force a re-render.

A teammate suspected the `React.memo` was blocking updates, but removing it did not help. The child always receives the latest props; the problem is in the callback itself.

## Buggy code

```typescript
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

  const handleCheckout = useCallback(() => {
    dispatch({ type: "CHECKOUT", total: state.total });
  }, []);

  return (
    <div>
      <p>Total: ${state.total}</p>
      <CheckoutButton onCheckout={handleCheckout} />
    </div>
  );
};
```
