---
slug: use-memo-wrong-deps
track: javascript
orderIndex: 92
title: useMemo Dependency Array Missing Transactions
difficulty: medium
tags:
  - memoization
  - useMemo
  - deps
  - correctness
language: typescript
---

## Context

A reporting page uses `useMemo` to compute the total revenue from a list of transactions. The total displayed on screen never updates after the initial render, even when new transactions are loaded from the server and the `transactions` state changes.

## Buggy code

```typescript
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

  const total = useMemo(() => {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }, []);

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
