## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Async validation function is called without await, so invalid data always passes the check
// ------------------------------------------------------------------------
async function productExists(productId) {
  const row = await db.products.findById(productId);
  return row !== null;
}

app.post("/orders", express.json(), async (req, res) => {
  const { productId, quantity } = req.body;

  try {
    // CHANGE 1: await the async productExists call so we get the boolean result, not an unresolved Promise (which is always truthy and bypasses the guard).
    // CHANGE 2: moved the existence check inside try/catch so DB errors during validation are caught and return a 500 instead of an unhandled rejection.
    if (!await productExists(productId)) {
      return res.status(400).json({ error: "Product not found" });
    }

    const order = await db.orders.create({ productId, quantity });
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: "Order creation failed" });
  }
});
```

## Explanation

### Issue 1: Missing `await` on async validation call

**Problem:** Every order creation request succeeds regardless of whether the product exists. The validation check never blocks a bad request, so the database ends up with orders that reference non-existent product IDs.

**Fix:** Add `await` before `productExists(productId)` at the `CHANGE 1` site, turning `if (!productExists(productId))` into `if (!await productExists(productId))`. This lets the expression resolve to the actual boolean before the negation is evaluated.

**Explanation:** Calling an `async` function without `await` returns a `Promise` object immediately. A `Promise` object is a non-null object, so JavaScript evaluates it as truthy. Applying `!` to a truthy value gives `false`, meaning the `if` body never executes and validation is silently skipped. Adding `await` pauses execution until the Promise resolves to the real `true` or `false` boolean that `productExists` returns, so the guard works as intended. A related pitfall: this same silent failure happens with any async predicate — if you forget `await`, the condition always evaluates against the Promise object, not the resolved value.

---

### Issue 2: Validation call outside `try/catch` leaves errors unhandled

**Problem:** If the database is unavailable or `db.products.findById` throws for any reason, the error escapes the `try/catch` block entirely. In Express, an unhandled rejection inside an `async` route handler either silently swallows the error (Express 4) or crashes the process (Node with `--unhandled-rejections=throw`), and the client receives no response or a generic connection reset.

**Fix:** At the `CHANGE 2` site, the `if (!await productExists(productId))` check is moved inside the existing `try/catch` block so any thrown error is caught by the same `catch (err)` handler that already returns a 500 response.

**Explanation:** The original code placed the validation check before the `try` block, so only the `db.orders.create` call was protected. Moving the `await productExists(...)` call inside `try` means a transient DB failure during the lookup gets caught and returns a `500` with a JSON body, which is a predictable, client-visible response. This also keeps error handling logic in one place rather than split across two code paths.
