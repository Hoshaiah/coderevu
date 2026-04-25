---
slug: use-transition-stale-input-value
track: javascript
orderIndex: 58
title: Stale Input Inside useTransition
difficulty: medium
tags:
  - hooks
  - state
  - react
  - closures
language: typescript
---

## Context

This component lives in `src/components/SearchBox.tsx` and drives a large product catalog search. The input value is kept in React state, and expensive filtering is wrapped in `startTransition` so the UI stays responsive while results are being computed.

Users report that after typing quickly, the displayed results sometimes don't match what they typed — results seem to lag behind by a character or more. Occasionally the result list reflects a query from several keystrokes ago even though the input field shows the correct text.

The team added `console.log` inside the transition callback and confirmed the logged query is stale relative to the input field's current value. They've ruled out debouncing — there is none in place.

## Buggy code

```typescript
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
      // Use the state variable so the transition captures the "latest" value
      const filtered = allProducts.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase())
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
