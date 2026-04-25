---
slug: typeof-null-check
track: javascript
orderIndex: 27
title: typeof null Passes Object Check
difficulty: easy
tags:
  - types
  - correctness
  - javascript
language: javascript
---

## Context

This function is part of `src/utils/deepClone.js`, a hand-rolled deep clone utility used across several internal tools. It recursively copies plain objects and arrays while passing primitive values through as-is.

In production, calling `deepClone(null)` throws `"Cannot convert undefined or null to object"` at the `Object.keys` call. Several API responses include `null` values for optional nested fields, causing the entire serialisation pipeline to crash and return `500` to the client.

The team added a check for `typeof value === "object"` which they believed covered the null case. They were surprised to find the error still occurring.

## Buggy code

```javascript
function deepClone(value) {
  if (typeof value !== "object" || typeof value === "function") {
    // primitive or function — return as-is
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(deepClone);
  }

  // plain object
  const clone = {};
  for (const key of Object.keys(value)) {
    clone[key] = deepClone(value[key]);
  }
  return clone;
}
```
