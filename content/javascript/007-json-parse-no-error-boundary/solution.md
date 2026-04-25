## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — JSON.parse Throws on Malformed Input
// ------------------------------------------------------------------------

const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function parseWebhook(req, res, next) {
  const signature = req.headers['x-payment-signature'];
  const rawBody = req.rawBody; // set by earlier body-parser middleware

  // CHANGE 2: Guard against missing rawBody so downstream calls don't throw a TypeError on undefined/null input.
  if (!rawBody) {
    return res.status(400).json({ error: 'Missing request body' });
  }

  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // CHANGE 1: Wrap JSON.parse in try/catch so a malformed payload returns 400 instead of crashing the process.
  try {
    req.webhookPayload = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  next();
}

module.exports = parseWebhook;
```

## Explanation

### Issue 1: Uncaught `SyntaxError` from `JSON.parse`

**Problem:** When the payment provider sends a truncated or malformed body, `JSON.parse` throws a `SyntaxError`. Because nothing catches it, Express receives an unhandled exception, the process crashes, and PM2 restarts it. Every in-flight request during that window gets no response, which the payment system interprets as a failure.

**Fix:** Wrap `JSON.parse(rawBody)` in a `try/catch` block. The `catch` branch returns `res.status(400).json({ error: 'Invalid JSON payload' })` and does not call `next()`, so the request is terminated cleanly without propagating the error.

**Explanation:** `JSON.parse` is a synchronous function that throws on any input that is not valid JSON — a truncated string, an empty string, or a stray byte are all enough to trigger it. Express does not automatically catch synchronous throws inside middleware unless you pass the error to `next(err)` or use an error-handling middleware; in this code neither exists. Wrapping the call in `try/catch` converts the throw into a controlled 400 response. A related pitfall: even with error-handling middleware (`app.use((err, req, res, next) => …)`), relying on it for this case means the error travels further up the stack than necessary and may be harder to distinguish from other error types.

---

### Issue 2: No guard against `undefined`/`null` `rawBody`

**Problem:** If the body-parser middleware that sets `req.rawBody` is missing, misconfigured, or skipped for a particular content-type, `req.rawBody` is `undefined`. Passing `undefined` to `crypto.createHmac().update()` throws a `TypeError`, and passing it to `JSON.parse` also throws — both before any error response is sent.

**Fix:** Add an early check `if (!rawBody)` immediately after reading `req.rawBody`. If the value is falsy the middleware returns `res.status(400).json({ error: 'Missing request body' })` and exits, preventing any downstream call from receiving a bad value.

**Explanation:** `req.rawBody` is a non-standard property set by convention, not guaranteed by Express itself. If the upstream middleware chain changes — for example, a route is added that bypasses the raw-body parser — `rawBody` silently becomes `undefined`. At that point `crypto`'s `update` method rejects the value, producing a `TypeError` that is just as fatal as the `SyntaxError` in Issue 1. The guard makes the failure mode explicit and sends a diagnosable 400 to the caller rather than killing the process.
