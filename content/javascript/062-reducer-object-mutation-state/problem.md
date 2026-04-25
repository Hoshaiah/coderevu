---
slug: reducer-object-mutation-state
track: javascript
orderIndex: 62
title: Direct State Mutation in Reducer
difficulty: easy
tags:
  - state
  - react
  - correctness
language: typescript
---

## Context

This reducer lives in `src/reducers/cartReducer.ts` and manages a shopping cart in a React app using `useReducer`. The cart displays items, quantities, and a running total. The total is recomputed in a `useMemo` that depends on the cart state.

Users report that adding items to the cart sometimes shows the correct item list but the total fails to update, or the total updates but the component does not re-render to reflect the new item. The bug is inconsistent — it appears more often on fast repeated clicks of the "Add to cart" button.

The team has already verified the `useMemo` dependency array is correct and that the `ADD_ITEM` action is being dispatched.

## Buggy code

```typescript
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
        existing.quantity += 1; // update in place
        return state;           // return same reference
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
