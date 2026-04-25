---
slug: object-spread-prototype-leak
track: javascript
orderIndex: 74
title: Prototype Methods Leaked via Spread
difficulty: medium
tags:
  - security
  - types
  - correctness
language: javascript
---

## Context

This code lives in `src/api/middleware/sanitize.js` in an Express application. Its job is to produce a clean, plain-object copy of request body data before it is passed to database insertion logic. The team deliberately avoids lodash and wants a zero-dependency solution.

A security audit flagged that specially crafted POST bodies can inject `__proto__` or constructor properties that survive the sanitisation step and end up persisted to the database. The `sanitize` function was written to strip unknown keys and thought to produce safe plain objects, but the audit's test payload `{ "__proto__": { "isAdmin": true } }` made it through.

The team already confirmed that body-parser produces a plain object from JSON, so the attack surface is specifically inside `sanitize`. They also verified that direct `obj.hasOwnProperty` checks are in place for the whitelist logic, so the leak is happening elsewhere.

## Buggy code

```javascript
const ALLOWED_KEYS = ["name", "email", "message"];

/**
 * Returns a sanitised copy of the request body containing only allowed keys.
 */
function sanitize(body) {
  const clean = {};

  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) {
      clean[key] = body[key];
    }
  }

  // Merge in default values for missing fields
  const defaults = { name: "Anonymous", message: "" };
  return { ...defaults, ...clean };
}

module.exports = { sanitize };
```
