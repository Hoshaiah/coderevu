---
slug: reduce-accumulator-missing-return
track: javascript
orderIndex: 8
title: Reduce Callback Missing Return Value
difficulty: easy
tags:
  - async
  - closures
  - api-misuse
language: javascript
---

## Context

This utility lives in `src/analytics/aggregator.js` and processes an array of page-view event objects to build a frequency map of URLs. It is called by a background job every hour to compute the top-visited pages and store the result in a Redis cache.

Ops notices that the Redis cache for top pages is always empty — the stored object is `undefined`. The job itself does not throw any errors, and the pipeline shows it completing successfully. The frequency map appears to be the culprit: when the developer logs it just before writing to Redis, it prints `undefined`.

A unit test that checks the shape of the output was accidentally deleted in a recent merge, which is why this regressed silently.

## Buggy code

```javascript
function buildFrequencyMap(events) {
  return events.reduce((acc, event) => {
    const { url } = event;
    if (!acc[url]) {
      acc[url] = 0;
    }
    acc[url] += 1;
  }, {});
}

function getTopPages(events, limit = 10) {
  const freq = buildFrequencyMap(events);
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([url, count]) => ({ url, count }));
}

module.exports = { buildFrequencyMap, getTopPages };
```
