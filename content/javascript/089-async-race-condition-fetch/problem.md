---
slug: async-race-condition-fetch
track: javascript
orderIndex: 89
title: Async Race Condition In Fetch
difficulty: medium
tags:
  - effects
  - async
  - race-condition
  - fetch
language: typescript
---

## Context

This `SearchBox` component fetches search results as the user types. In slow-network conditions, testers noticed that typing quickly and then pausing sometimes shows results that match an earlier query rather than the text currently in the input field.

## Buggy code

```typescript
import { useEffect, useState } from "react";

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data) => setResults(data.results));
  }, [query]);

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>
        {results.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
```
