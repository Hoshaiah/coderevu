---
slug: json-parse-no-error-boundary
track: javascript
orderIndex: 7
title: JSON.parse Throws on Malformed Input
difficulty: easy
tags:
  - async
  - error-handling
  - security
language: javascript
---

## Context

This middleware lives in `src/middleware/parseWebhook.js` in an Express service that receives webhook payloads from a third-party payment provider. The body is delivered as a raw string so the HMAC signature can be verified before parsing.

The service crashes in production with `SyntaxError: Unexpected token` whenever the payment provider sends a malformed or partially-delivered payload — for example, during provider-side incidents or network truncation. The process restarts via PM2 but any in-flight requests during the crash window are lost, causing false-negative payment confirmations.

A crash-reporting tool shows these errors originate exclusively from `JSON.parse` in this middleware, not from the signature verification step.

## Buggy code

```javascript
const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function parseWebhook(req, res, next) {
  const signature = req.headers['x-payment-signature'];
  const rawBody = req.rawBody; // set by earlier body-parser middleware

  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  req.webhookPayload = JSON.parse(rawBody);
  next();
}

module.exports = parseWebhook;
```
