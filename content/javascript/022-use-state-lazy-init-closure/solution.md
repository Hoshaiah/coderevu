## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Stale Closure in useState Initializer
// ------------------------------------------------------------------------

import React, { useState, useEffect } from "react";

interface SearchPanelProps {
  defaultQuery: string;
  onSearch: (query: string) => void;
}

export function SearchPanel({ defaultQuery, onSearch }: SearchPanelProps) {
  const [query, setQuery] = useState(defaultQuery);

  // CHANGE 1: Add a useEffect that syncs local state whenever the defaultQuery prop changes, because useState only uses its argument on the very first render and ignores subsequent prop updates.
  useEffect(() => {
    setQuery(defaultQuery);
  }, [defaultQuery]);

  return (
    <div className="search-panel">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      // CHANGE 2: Pass query directly in the onClick handler closure so onSearch always receives the current query value from local state rather than a potentially stale captured reference.
      <button onClick={() => onSearch(query)}>Search</button>
    </div>
  );
}
```

## Explanation

### Issue 1: useState Ignores Prop Updates After Mount

**Problem:** When the parent component changes `defaultQuery` (e.g., user clicks a saved-search link), the search input stays frozen on the value from the first render. The new prop value is visible in React DevTools but the input never reflects it.

**Fix:** A `useEffect` with `[defaultQuery]` in the dependency array is added after the `useState` call. Whenever `defaultQuery` changes, the effect fires `setQuery(defaultQuery)`, pushing the new value into local state.

**Explanation:** `useState(defaultQuery)` only reads its argument during the initial render. React treats the argument as a one-time seed, not a live binding. On every subsequent render — even if `defaultQuery` is different — React ignores the argument and returns the existing state value. The `useEffect` hook fills that gap: it watches `defaultQuery` as a dependency and imperatively syncs local state whenever the prop changes. One thing to be aware of: this sync will also overwrite any in-progress user edits if `defaultQuery` changes while the user is mid-typing. If that matters, add a "dirty" flag or debounce the effect, but for the described use case (navigating to a saved search) immediate sync is the right behavior.

---

### Issue 2: Stale Closure Risk in onSearch Button Handler

**Problem:** The `onClick` handler on the Search button captures `query` from the render scope. In most straightforward cases this works, but if `onSearch` or the button ever gets memoized (e.g., wrapped in `React.memo` or passed through `useCallback`), the handler may call `onSearch` with a stale query value rather than the latest one the user typed.

**Fix:** The `onClick` arrow function `() => onSearch(query)` is kept as an inline closure rather than being hoisted or memoized, ensuring it re-creates on every render and always closes over the freshest `query` from state.

**Explanation:** Because `query` lives in `useState`, React re-renders the component each time `setQuery` is called, and each render creates a new inline `() => onSearch(query)` closure pointing at the current `query` value. The risk appears when someone wraps the button in a memoized child or uses `useCallback` without listing `query` as a dependency — then the old closure fires with a stale value. Keeping the handler inline on the button (as in the reference solution) avoids that trap entirely. If performance ever requires memoization, `useCallback(() => onSearch(query), [query, onSearch])` is the safe form because both dependencies are listed explicitly.
