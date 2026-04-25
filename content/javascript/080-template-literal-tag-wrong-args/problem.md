---
slug: template-literal-tag-wrong-args
track: javascript
orderIndex: 80
title: Tagged Template Receives Raw Strings
difficulty: hard
tags:
  - security
  - correctness
  - api-misuse
language: javascript
---

## Context

This module lives in `db/query.js` and implements a tagged template literal function `sql` intended to produce parameterized queries safe against SQL injection. The pattern is borrowed from libraries like `sql-template-strings`. It is used throughout the data access layer to build database queries.

A security audit found that certain user-supplied values are being interpolated directly into the query string rather than being passed as bound parameters. The queries look correct in logs — the audit tooling inspects the built query object and finds the `values` array empty even when interpolated variables are present.

The developer wrote a test with a static string and it passed. They confirmed the tag function is being called (it logs a `console.log` they added). The issue is in how the template parts and values are extracted from the tag function's arguments.

## Buggy code

```javascript
/**
 * Tagged template literal that builds a parameterized SQL query object.
 * Usage: sql`SELECT * FROM users WHERE id = ${userId}`
 */
function sql(strings, ...values) {
  // BUG: using strings.raw instead of strings
  const rawParts = strings.raw;
  let text = "";
  const params = [];

  rawParts.forEach((part, i) => {
    text += part;
    if (i < values.length) {
      // Intended: add placeholder and push value to params
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });

  return { text, values: params };
}

// Usage
const userId = req.params.id; // user-supplied
const query = sql`SELECT * FROM users WHERE id = ${userId}`;
await db.query(query.text, query.values);

module.exports = { sql };
```
