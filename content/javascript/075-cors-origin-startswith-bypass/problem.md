---
slug: cors-origin-startswith-bypass
track: javascript
orderIndex: 75
title: CORS Origin Check Bypassable
difficulty: medium
tags:
  - security
  - correctness
  - http
language: javascript
---

## Context

This middleware lives in `src/middleware/cors.js` in an Express API that serves a single-page application hosted at `https://app.example.com`. The API handles authenticated requests, so the CORS policy is intentionally restrictive — only requests from `https://app.example.com` should be allowed.

A security audit flags that an attacker-controlled origin like `https://app.example.com.evil.org` successfully receives `Access-Control-Allow-Origin: https://app.example.com.evil.org` from the server, meaning the browser will permit the cross-origin request and include credentials. The API logs show legitimate-looking CORS grants for origins that are not the real app.

The team believed the check was safe because it references the exact string `'https://app.example.com'`. No wildcard characters are used anywhere in the code.

## Buggy code

```javascript
const ALLOWED_ORIGIN = 'https://app.example.com';

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  if (origin && origin.startsWith(ALLOWED_ORIGIN)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

module.exports = corsMiddleware;
```
