---
slug: use-memo-missing-dep-prop
track: javascript
orderIndex: 57
title: useMemo Missing Prop Dependency
difficulty: medium
tags:
  - hooks
  - state
  - react
language: typescript
---

## Context

This component lives in `src/components/SortedTable.tsx` and renders a sortable data table. The `rows` prop contains the raw data from a parent component, and `sortKey` state tracks which column is currently sorted. The sorted list is memoized to avoid re-sorting on every render.

Users report that when the parent updates the `rows` prop (e.g., after a data refresh), the table continues to show the old, stale data. Clicking a column header to change the sort key makes the new data appear immediately — but only because that changes `sortKey`, not because of the prop update.

The developer checked that the parent is correctly passing new data (confirmed via `console.log` in the parent render), and the prop arriving in `SortedTable` does reflect the new rows.

## Buggy code

```typescript
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
  }, [sortKey]); // <-- dependency array

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
