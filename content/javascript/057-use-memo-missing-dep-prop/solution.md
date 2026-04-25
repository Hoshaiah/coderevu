## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — useMemo Missing Prop Dependency
// ------------------------------------------------------------------------

import { useState, useMemo } from 'react';

interface Row {
  id: number;
  name: string;
  score: number;
}

interface Props {
  rows: Row[];
}

export function SortedTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<keyof Row>('name');

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
  // CHANGE 1: added `rows` to the dependency array so the memo recomputes whenever the parent passes a new rows reference, not only when sortKey changes.
  }, [sortKey, rows]);

  return (
    <table>
      <thead>
        <tr>
          {(['id', 'name', 'score'] as (keyof Row)[]).map((key) => (
            <th key={key} onClick={() => setSortKey(key)}>{key}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.id}>
            <td>{row.id}</td>
            <td>{row.name}</td>
            <td>{row.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

## Explanation

### Issue 1: Missing `rows` in `useMemo` dependencies

**Problem:** When the parent component refreshes its data and passes a new `rows` array down, the table keeps showing the old rows. The sorted list only updates when the user clicks a column header, because that changes `sortKey` — the only value in the dependency array.

**Fix:** Add `rows` to the `useMemo` dependency array at the `CHANGE 1` site, changing `[sortKey]` to `[sortKey, rows]`.

**Explanation:** `useMemo` caches its return value and only recomputes when one of the listed dependencies changes between renders. Because `rows` was not listed, React never invalidated the cached `sorted` array when the prop changed. The callback closed over the `rows` variable from the render in which the memo was last computed, so even though the prop held new data, the memo kept returning the result of sorting the old array. Adding `rows` to the dependency array tells React to recompute `sorted` whenever the parent passes a different array reference. One related pitfall: if the parent recreates the `rows` array on every render (e.g., inline `rows={data.map(...)}`) this will cause `useMemo` to recompute every render too, because each map call produces a new reference — the fix is correct here, but the parent should stabilize its own reference with `useMemo` if that becomes a performance concern.

---

### Issue 2: Stale closure captures outdated `rows` reference

**Problem:** Even though `[...rows]` inside the memo appears to spread the current prop, the closure captures whichever `rows` value was in scope when the memo last ran. Without `rows` in the dependency array, that captured reference is the one from the first render (or the last render where `sortKey` changed), not the latest prop value.

**Fix:** The same `CHANGE 1` addition of `rows` to the dependency array resolves the stale closure: React will re-run the factory function with the up-to-date `rows` binding whenever the prop reference changes.

**Explanation:** JavaScript closures capture variables by reference to the surrounding scope, but in React's memoization model the factory function is only re-executed when dependencies signal a change. If a variable used inside the factory is not in the dependency list, the factory runs with a frozen snapshot of that variable from a previous render. So `[...rows]` was spreading the stale array, not the current one. Adding `rows` to dependencies ensures the factory always sees the latest prop. This is the same reason the React `exhaustive-deps` ESLint rule flags any variable used inside `useMemo` or `useCallback` that is absent from the dependency array — the rule exists precisely to prevent this class of stale-closure bug.
