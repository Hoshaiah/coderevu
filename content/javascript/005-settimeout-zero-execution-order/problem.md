---
slug: settimeout-zero-execution-order
track: javascript
orderIndex: 5
title: Sync Assertion Before Async Callback
difficulty: easy
tags:
  - async
  - closures
  - correctness
language: javascript
---

## Context

This snippet is from `tests/unit/queue.test.js`, a Jest test suite for a task queue module. The queue accepts tasks and processes them 'asynchronously' using `setTimeout(fn, 0)` to defer work to the next iteration of the event loop. The test verifies that a task's callback is invoked after being enqueued.

The test always passes on the first assertion (`expect(called).toBe(false)`) but always fails on the second (`expect(called).toBe(true)`). Developers assumed `setTimeout(fn, 0)` would have fired by the time the second `expect` line is reached, since 0 ms is essentially immediate.

Switching from Jest's default fake timers to real timers did not help. The task queue code itself has been verified to work correctly in a running application — the test infrastructure is the only place failures appear.

## Buggy code

```javascript
const { createQueue } = require('./queue');

test('task callback is invoked after enqueue', () => {
  const queue = createQueue();
  let called = false;

  queue.enqueue(() => {
    called = true;
  });

  expect(called).toBe(false); // passes: task hasn't run yet

  // Give the event loop a tick for setTimeout(fn, 0) to fire
  setTimeout(() => {
    expect(called).toBe(true);
  }, 0);
});
```
