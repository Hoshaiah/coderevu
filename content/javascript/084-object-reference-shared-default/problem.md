---
slug: object-reference-shared-default
track: javascript
orderIndex: 84
title: >-
  Multiple requests corrupt each other's filter options through a shared object
  default
difficulty: easy
tags:
  - correctness
  - reference-types
  - api-design
language: javascript
---

## Context

This Express route handler builds a query for a product search endpoint. A helper function merges caller-supplied options with a set of defaults before passing them to the database layer.

In production, concurrent requests are occasionally returning results filtered by another user's category or price range, seemingly at random. The bug only appears under load.

## Buggy code

```javascript
function buildQuery(userOptions, defaults = { page: 1, limit: 20, filters: {} }) {
  Object.assign(defaults.filters, userOptions.filters);
  return {
    page: userOptions.page || defaults.page,
    limit: userOptions.limit || defaults.limit,
    filters: defaults.filters,
  };
}

app.get("/products", (req, res) => {
  const query = buildQuery({
    page: Number(req.query.page),
    filters: { category: req.query.category },
  });
  db.products.find(query).then((rows) => res.json(rows));
});
```
