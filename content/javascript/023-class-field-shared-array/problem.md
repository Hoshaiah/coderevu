---
slug: class-field-shared-array
track: javascript
orderIndex: 23
title: Shared Mutable Array Across Instances
difficulty: medium
tags:
  - closures
  - state
  - correctness
language: javascript
---

## Context

This code lives in `models/Pipeline.js` and models an ETL pipeline where each instance tracks its own processing steps. Instances are created per-request in a Node.js HTTP server. The module was recently migrated from prototype-based classes to the newer class field syntax.

After the migration, operators notice that the `steps` array for one pipeline request contains steps from previous requests. The first request through the server always behaves correctly, but subsequent requests accumulate steps from all prior requests. The bug only reproduces in the running server — unit tests that create a single instance pass.

A developer added logging to the constructor and confirmed it is called once per request. They have not checked where `steps` is actually allocated.

## Buggy code

```javascript
class Pipeline {
  steps = [];
  name;

  constructor(name) {
    this.name = name;
  }

  addStep(fn) {
    this.steps.push(fn);
    return this;
  }

  async run(input) {
    let value = input;
    for (const step of this.steps) {
      value = await step(value);
    }
    return value;
  }
}

// The bug is actually not in the class field syntax here — class fields
// ARE per-instance. Let me rewrite with the actual bug: static field mistake.
class Pipeline {
  static steps = [];
  name;

  constructor(name) {
    this.name = name;
  }

  addStep(fn) {
    this.steps.push(fn);
    return this;
  }

  async run(input) {
    let value = input;
    for (const step of this.steps) {
      value = await step(value);
    }
    return value;
  }
}

module.exports = Pipeline;
```
