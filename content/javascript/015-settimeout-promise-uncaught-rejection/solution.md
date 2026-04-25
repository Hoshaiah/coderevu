## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Rejection Inside setTimeout Uncaught
// ------------------------------------------------------------------------

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
          // CHANGE 1: Replace the async IIFE with a plain callback that calls attempt() and pipes any rejection to reject() — this ensures errors from the recursive attempt() are never silently dropped by setTimeout.
          setTimeout(() => {
            attempt().catch(reject);
          }, delayMs);
        });
    }

    attempt();
  });
}

module.exports = { retryWithDelay };
```

## Explanation

### Issue 1: setTimeout Drops Async Callback Rejection

**Problem:** When all retry attempts are exhausted and `reject(err)` is called inside a deeply nested `attempt()` invocation, the rejection never reaches the caller's `.catch()` handler. Operators see `UnhandledPromiseRejectionWarning` (or a process crash in Node 17+), even though the calling code has a `.catch()` attached to `retryWithDelay(...)`.

**Fix:** Replace `setTimeout(async () => { await attempt(); }, delayMs)` with `setTimeout(() => { attempt().catch(reject); }, delayMs)`. The `.catch(reject)` on line immediately inside the plain arrow function forwards any rejection from the recursive `attempt()` call directly to the outer Promise's `reject` function.

**Explanation:** `setTimeout` receives a callback and fires it later, but it has no mechanism to observe or forward a Promise returned by that callback. When the callback is `async`, it returns a Promise — but `setTimeout` throws that Promise away. Any rejection that happens inside the async callback (including a re-thrown error or a downstream `reject()` call that was supposed to bubble up) has no owner, so Node treats it as an unhandled rejection. The fix removes the `async` keyword so no stray Promise is created, and it chains `.catch(reject)` on the `attempt()` call. Because `attempt()` returns a regular Promise (it uses `.then`/`.catch` internally), any rejection that escapes it — such as when `reject(err)` is called inside a later iteration — is now explicitly forwarded to the outer Promise's `reject`, which is exactly what the caller's `.catch()` is listening to. A related pitfall: wrapping the `setTimeout` body back in `async/await` without the `.catch(reject)` guard recreates the same bug, because `await` inside a dropped async callback still doesn't connect to the outer Promise chain.

---
