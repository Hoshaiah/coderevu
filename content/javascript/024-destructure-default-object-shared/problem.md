---
slug: destructure-default-object-shared
track: javascript
orderIndex: 24
title: Shared Default Object Across Calls
difficulty: medium
tags:
  - closures
  - state
  - mutation
language: javascript
---

## Context

The helper `src/utils/buildQuery.js` constructs database query configuration objects for a MongoDB wrapper used across multiple microservices. It accepts partial options and merges them with sensible defaults. It is called many times per request to build different query shapes.

Engineers have noticed that filters added in one call to `buildQuery` sometimes appear in a subsequent unrelated call within the same process lifetime. The bug is intermittent and only manifests when multiple query builders are run in the same request cycle. Restarting the server clears the pollution temporarily.

Inspecting logs shows the `filter` object accumulating extra keys over time. The team confirmed they are not sharing any module-level state intentionally.

## Buggy code

```javascript
/**
 * Builds a MongoDB query configuration object.
 * @param {object} options
 * @returns {object}
 */
function buildQuery(options = {}) {
  const defaults = {
    filter: {},
    projection: { _id: 1 },
    limit: 100,
    skip: 0,
  };

  const config = Object.assign(defaults, options);

  if (config.filter.status === undefined) {
    config.filter.status = "active";
  }

  return config;
}

module.exports = { buildQuery };

// Simulated request cycle:
const q1 = buildQuery({ filter: { userId: "abc" } });
console.log(q1.filter); // { userId: 'abc', status: 'active' }

const q2 = buildQuery({});
console.log(q2.filter); // Expected: { status: 'active' }
                         // Actual:   { userId: 'abc', status: 'active' }
```
