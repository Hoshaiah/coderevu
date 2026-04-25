## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — BigInt Precision Lost in JSON Response
// ------------------------------------------------------------------------

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
  // CHANGE 1: Convert BigInt to string instead of Number to preserve all digits without precision loss.
  // CHANGE 2: Using String() also prevents the TypeError res.json throws when it encounters a raw BigInt during JSON.stringify.
  res.json({
    id: String(row.id),
    amount: row.amount,
    status: row.status,
  });
}
```

## Explanation

### Issue 1: BigInt-to-Number Precision Loss

**Problem:** Transaction IDs larger than `2^53 - 1` (9,007,199,254,740,991) are silently rounded when passed through `Number()`. The frontend receives an ID like `9223372036854775800` instead of `9223372036854775807`, and the last few digits are always wrong — typically becoming `000`.

**Fix:** Replace `Number(row.id)` with `String(row.id)` so the full decimal representation of the BigInt is placed in the JSON response as a string.

**Explanation:** JavaScript's `number` type uses IEEE 754 double-precision floating point, which has only 53 bits of integer mantissa. Any integer beyond `Number.MAX_SAFE_INTEGER` cannot be represented exactly; the runtime picks the nearest float and discards the difference. PostgreSQL `bigint` uses 64 bits, so IDs above the safe integer limit are routine as volume grows. Converting to a string sidesteps IEEE 754 entirely — every decimal digit is preserved. The frontend must parse the field as a string (or use a BigInt-capable library), but that is a cheap adaptation compared to silently wrong IDs.

---

### Issue 2: JSON.stringify Throws on Raw BigInt

**Problem:** If a raw `BigInt` value ever reaches `res.json` — for example if the `Number()` call were removed without adding `String()` — Express's internal `JSON.stringify` call throws `TypeError: Do not know how to serialize a BigInt`, resulting in an unhandled error and a 500 response.

**Fix:** `String(row.id)` at CHANGE 2 converts the BigInt to a plain `string` before the object is handed to `res.json`, so `JSON.stringify` sees a normal string and serializes it without error.

**Explanation:** `JSON.stringify` has no built-in handling for `BigInt` and deliberately throws rather than silently losing precision. A custom `replacer` function can intercept BigInt values, but it must be passed explicitly — `res.json` does not accept a replacer. Calling `String()` before building the response object is the minimal, reliable fix: it produces a JSON string like `"id":"9223372036854775807"` which round-trips losslessly. The only coordination needed is that API consumers treat the `id` field as a string, which is the standard approach for 64-bit IDs in JSON (Twitter's Snowflake IDs follow the same convention).
