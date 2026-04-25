---
slug: object-computed-key-tostring-collision
track: javascript
orderIndex: 35
title: Object Keys Silently Collide
difficulty: easy
tags:
  - types
  - correctness
  - objects
language: javascript
---

## Context

This module is `src/analytics/rollup.js`. It aggregates raw event records by a composite key made from the event's `type` field and its `targetId` field, then counts occurrences. The result is used downstream to render a summary table in the admin dashboard.

The analytics team reports that some rows in the summary table have suspiciously high counts — far higher than the raw event logs suggest. The bug only appears when event types contain underscores and numeric target IDs are also present, but nobody has been able to pin down exactly which combinations are affected.

A colleague added a `console.log(Object.keys(result).length)` and found far fewer unique keys than expected, confirming that distinct combinations are being merged. The composite key construction is the prime suspect.

## Buggy code

```javascript
function rollupEvents(events) {
  const result = {};

  for (const event of events) {
    const key = [event.type, event.targetId];
    if (result[key] === undefined) {
      result[key] = 0;
    }
    result[key] += 1;
  }

  return result;
}

// Example usage:
// rollupEvents([
//   { type: 'click', targetId: 42 },
//   { type: 'click,42', targetId: undefined },  // different combination!
// ])
// Both events end up under the same key: "click,42"
```
