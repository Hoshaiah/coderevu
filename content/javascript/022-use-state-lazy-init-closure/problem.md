---
slug: use-state-lazy-init-closure
track: javascript
orderIndex: 22
title: Stale Closure in useState Initializer
difficulty: easy
tags:
  - closures
  - react
  - hooks
  - state
language: typescript
---

## Context

This component lives in `src/components/SearchPanel.tsx` and renders a search input that is pre-populated from a URL query parameter. The component is rendered inside a larger page that can swap query params without unmounting the panel.

Developers notice that when the parent updates the `defaultQuery` prop (e.g., the user clicks a "saved search" link that changes the URL), the input never reflects the new value — it stays stuck on whatever the first render's prop was.

The team ruled out routing issues (the prop value is confirmed correct in React DevTools) and confirmed the component is not being remounted between navigations. The bug was introduced when the team switched from a class component to a functional one.

## Buggy code

```typescript
import React, { useState } from "react";

interface SearchPanelProps {
  defaultQuery: string;
  onSearch: (query: string) => void;
}

export function SearchPanel({ defaultQuery, onSearch }: SearchPanelProps) {
  const [query, setQuery] = useState(defaultQuery);

  return (
    <div className="search-panel">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      <button onClick={() => onSearch(query)}>Search</button>
    </div>
  );
}
```
