---
slug: missing-await-async-validator
track: javascript
orderIndex: 9
title: "Async validation function is called without await, so invalid data always passes the check"
difficulty: medium
tags: ["async", "correctness", "error-handling"]
language: javascript
---

## Context

This Express handler creates a new order after checking that the referenced product ID actually exists in the database. The `productExists` helper performs an async database lookup and returns a boolean.

QA reports that orders are being created with non-existent product IDs, meaning the validation gate is effectively doing nothing.

## Buggy code

```javascript
async function productExists(productId) {
  const row = await db.products.findById(productId);
  return row !== null;
}

app.post("/orders", express.json(), async (req, res) => {
  const { productId, quantity } = req.body;

  if (!productExists(productId)) {
    return res.status(400).json({ error: "Product not found" });
  }

  try {
    const order = await db.orders.create({ productId, quantity });
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: "Order creation failed" });
  }
});
```
