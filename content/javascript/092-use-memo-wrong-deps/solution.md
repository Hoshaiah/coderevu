## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — useMemo with an empty dependency array returns a permanently stale computed value
// ------------------------------------------------------------------------
import { useMemo, useState } from "react";

interface Transaction {
  id: string;
  amount: number;
}

export function RevenueReport() {
  const [transactions, setTransactions] = useState<Transaction[]>([
    { id: "t1", amount: 120 },
    { id: "t2", amount: 80 },
  ]);

  // CHANGE 1: Add `transactions` to the dependency array so the memo recomputes whenever the transactions list changes.
  // CHANGE 2: `transactions` is now listed, satisfying exhaustive-deps and ensuring the closure always sees the current array.
  const total = useMemo(() => {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const loadMore = () => {
    setTransactions((prev) => [...prev, { id: "t3", amount: 200 }]);
  };

  return (
    <div>
      <p>Total revenue: ${total}</p>
      <button onClick={loadMore}>Load more</button>
    </div>
  );
}
```

## Explanation

### Issue 1: Empty dependency array prevents recomputation

**Problem:** The `total` value displayed on screen stays at `200` (the sum of the initial two transactions) even after the user clicks "Load more" and a new transaction is added. `useMemo` with `[]` runs its factory function exactly once — on the first render — and returns the cached result forever after.

**Fix:** Replace `[]` with `[transactions]` in the `useMemo` call (the second argument). This is the only line that changes.

**Explanation:** `useMemo` compares each value in the dependency array between renders using `Object.is`. When the array is empty, there is nothing to compare, so React concludes the inputs have not changed and returns the previously memoized value every time. Because `setTransactions` replaces the array reference with a new one (`[...prev, ...]`), adding `transactions` to the dependency array gives React something concrete to compare. On the render after `loadMore` fires, `Object.is(prevTransactions, nextTransactions)` returns `false`, React re-runs the reducer, and `total` reflects the updated list. A related pitfall: if you mutated the existing array in place instead of creating a new one, the reference would stay the same and the memo still would not recompute — always treat state as immutable.

---

### Issue 2: Missing dependency violates exhaustive-deps contract

**Problem:** The `eslint-plugin-react-hooks` `exhaustive-deps` rule (enabled by default in most React setups) flags any value used inside a `useMemo` or `useEffect` callback that is not listed as a dependency. Beyond the linting warning, the omission means the closure captured inside `useMemo` holds a reference to the `transactions` value from the first render and never updates it — a stale closure.

**Fix:** Listing `transactions` in `[transactions]` satisfies the exhaustive-deps rule and ensures the closure inside the memo always reads the most recent `transactions` reference.

**Explanation:** Each time React renders a component, new function closures are created that close over the current values of all variables in scope. `useMemo` can skip re-running its factory and reuse an old closure — but only safely when every outside value the factory uses is declared as a dependency. If a value is omitted, the factory may read a stale copy of that variable even though the component has re-rendered with updated state. In this case `transactions` is the only outside variable the factory uses, so adding it is both necessary and sufficient. If the computation depended on additional state or props, each of those would need to appear in the array as well.
