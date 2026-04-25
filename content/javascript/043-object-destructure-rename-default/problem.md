---
slug: object-destructure-rename-default
track: javascript
orderIndex: 43
title: Destructure Default Shadows Rename
difficulty: hard
tags:
  - types
  - correctness
  - closures
language: javascript
---

## Context

This utility function is in `lib/config.js`. It merges a user-supplied options object with a set of defaults using destructuring. A `timeout` option must be specified in milliseconds; if the caller omits it, the default is `5000`. The function is called from a dozen places across the codebase with varying options.

Ops engineers notice that setting `{ timeout: 0 }` — a valid value used in integration tests to disable the timeout — is silently ignored and the code always behaves as if `timeout` is `5000`. No error is thrown. Setting `timeout` to any positive number works correctly.

The developer reviewed the function and believed the destructuring syntax was correct because it compiles and runs without any warning.

## Buggy code

```javascript
/**
 * @param {object} options
 * @param {number} [options.timeout] - Request timeout in ms. 0 = no timeout.
 * @param {string} [options.baseUrl]
 * @param {boolean} [options.retryOnFail]
 */
function createClient(options = {}) {
  const {
    timeout: timeout = 5000,
    baseUrl = "https://api.example.com",
    retryOnFail = true,
  } = options;

  return {
    timeout,
    baseUrl,
    retryOnFail,
    send(payload) {
      console.log(`Sending with timeout=${timeout}ms to ${baseUrl}`);
    },
  };
}

module.exports = { createClient };
```
