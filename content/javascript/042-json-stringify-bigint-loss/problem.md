---
slug: json-stringify-bigint-loss
track: javascript
orderIndex: 42
title: BigInt Precision Lost in JSON Response
difficulty: hard
tags:
  - types
  - correctness
  - security
language: typescript
---

## Context

This Express handler lives in `src/api/routes/transactions.ts`. The application stores transaction IDs as 64-bit integers in PostgreSQL using the `bigint` column type. The database driver returns these as JavaScript `BigInt` values to avoid precision loss. The handler fetches a transaction and returns it as JSON.

The frontend team reports that transaction IDs received from this endpoint occasionally do not match what they stored — specifically, the last few digits are always `000` or the ID is slightly different from what the database shows. The bug only manifests for IDs larger than `2^53 - 1` (about 9 quadrillion), which are increasingly common as transaction volume grows.

Database queries and logs confirm the correct ID is retrieved. The issue is isolated to serialization. The team tried `JSON.stringify` with a replacer but it still throws `TypeError: Do not know how to serialize a BigInt`.

## Buggy code

```typescript
import { Request, Response } from 'express';
import { db } from '../db';

export async function getTransaction(req: Request, res: Response) {
  const { id } = req.params;
  const transaction = await db.query(
    'SELECT id, amount, status FROM transactions WHERE id = $1',
    [id]
  );

  if (!transaction.rows[0]) {
    return res.status(404).json({ error: 'Not found' });
  }

  const row = transaction.rows[0];
  // row.id is a BigInt from the driver
  res.json({
    id: Number(row.id),
    amount: row.amount,
    status: row.status,
  });
}
```
