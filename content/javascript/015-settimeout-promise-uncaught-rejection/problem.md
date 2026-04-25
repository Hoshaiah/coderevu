---
slug: settimeout-promise-uncaught-rejection
track: javascript
orderIndex: 15
title: Rejection Inside setTimeout Uncaught
difficulty: medium
tags:
  - async
  - promises
  - error-handling
language: javascript
---

## Context

This module lives in `src/jobs/retryJob.js` and implements a retry-with-delay wrapper used throughout the backend to re-attempt flaky third-party API calls. It is used in several Express route handlers and background workers.

Operators have noticed that when the retried operation ultimately fails (after all attempts), the process sometimes emits an `UnhandledPromiseRejection` warning and in newer Node versions (17+) the worker process crashes. The calling code has a `.catch()` handler attached to `retryWithDelay(...)`, but it never seems to fire.

Adding extra logging confirmed the rejection originates inside the `setTimeout` callback, not at the top-level `async` call site.

## Buggy code

```javascript
/**
 * Retries `fn` up to `attempts` times with `delayMs` between tries.
 * @returns {Promise<any>}
 */
function retryWithDelay(fn, attempts, delayMs) {
  return new Promise((resolve, reject) => {
    let tries = 0;

    function attempt() {
      fn()
        .then(resolve)
        .catch((err) => {
          tries += 1;
          if (tries >= attempts) {
            reject(err);
            return;
          }
          setTimeout(async () => {
            await attempt();
          }, delayMs);
        });
    }

    attempt();
  });
}

module.exports = { retryWithDelay };
```
