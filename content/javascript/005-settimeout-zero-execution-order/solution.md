## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Sync Assertion Before Async Callback
// ------------------------------------------------------------------------

const { createQueue } = require('./queue');

// CHANGE 1 & 2: Accept the `done` callback so Jest waits for it before marking the test finished; this also ensures the inner assertion failure actually fails the test.
test('task callback is invoked after enqueue', (done) => {
  const queue = createQueue();
  let called = false;

  queue.enqueue(() => {
    called = true;
  });

  expect(called).toBe(false); // passes: task hasn't run yet

  // CHANGE 1: Call `done` (or `done.fail`) inside the timeout so Jest keeps the test alive until this callback fires.
  // CHANGE 2: Wrap in try/catch and forward errors to `done.fail` so an assertion error actually fails the test instead of being silently lost.
  setTimeout(() => {
    try {
      expect(called).toBe(true);
      done();
    } catch (err) {
      done(err);
    }
  }, 0);
});
```

## Explanation

### Issue 1: Async assertion runs after test completes

**Problem:** Jest considers a synchronous test finished the moment the test function returns. The `setTimeout(..., 0)` callback fires on the next event-loop tick, which is after Jest has already recorded the test as passing. Any `expect` that throws inside that callback is treated as an uncaught exception, not a test failure — so the second assertion never actually fails the test.

**Fix:** Add the `done` parameter to the test function and call `done()` at the end of the `setTimeout` callback (and `done(err)` in the catch branch). This matches the `CHANGE 1` site: Jest now holds the test open until `done` is called.

**Explanation:** When Jest sees a test function that accepts at least one parameter, it switches to "async mode" and waits for `done` to be called before recording a result. Without `done`, Jest sees a zero-parameter function, runs it synchronously to completion, and moves on. The `setTimeout` callback fires later, but there is no open test context to receive its result. Passing `done` keeps that context alive. There is also a timeout (default 5 s) — if `done` is never called, Jest itself fails the test with a timeout error, which is useful for catching cases where the queue never invokes the task at all.

---

### Issue 2: Assertion errors inside setTimeout are silently lost

**Problem:** Even after fixing the `done` issue, an unhandled `throw` inside a `setTimeout` callback is not automatically routed to Jest's test failure machinery in all environments. The test could still appear to pass even when `called` is `false` at assertion time.

**Fix:** Wrap the `expect` call in a `try/catch` block and pass the caught error to `done(err)` on failure, and call `done()` on success. This is the `CHANGE 2` site: it explicitly forwards any thrown assertion error through `done`, which is the only guaranteed path to a Jest test failure from inside an async callback.

**Explanation:** Jest's `expect` signals a failure by throwing an error object. Inside a synchronous test function, that throw propagates up through Jest's runner. Inside a `setTimeout` callback, the throw goes to the event loop's uncaught-exception handler instead, which in Node.js may print a warning but does not communicate back to the active Jest test. By catching the error and calling `done(err)`, you hand the error directly to Jest through the `done` channel, which is the mechanism Jest actually monitors. A related pitfall: if you use `async/await` instead of `done`, you must `await` a returned Promise — forgetting to `return` the Promise from the test function causes the same silent-pass problem.
