---
slug: settimeout-this-binding
track: javascript
orderIndex: 100
title: >-
  Background job loses 'this' context inside a setTimeout callback and throws on
  every tick
difficulty: easy
tags:
  - this-binding
  - correctness
  - oop
language: javascript
---

## Context

A metrics collector class polls an external API every 30 seconds and appends results to an internal buffer. The class is instantiated once at startup and `start()` is called to kick off the polling loop.

The service starts without errors but the buffer is never populated, and the logs show a `TypeError: Cannot read properties of undefined (reading 'push')` every 30 seconds.

## Buggy code

```javascript
class MetricsCollector {
  constructor(apiClient) {
    this.client = apiClient;
    this.buffer = [];
  }

  async fetchAndStore() {
    const data = await this.client.getMetrics();
    this.buffer.push(data);
    console.log(`Buffer size: ${this.buffer.length}`);
  }

  start() {
    setInterval(this.fetchAndStore, 30_000);
  }
}

const collector = new MetricsCollector(apiClient);
collector.start();
```
