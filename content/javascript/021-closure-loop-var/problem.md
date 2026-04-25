---
slug: closure-loop-var
track: javascript
orderIndex: 21
title: >-
  All timer callbacks reference the same loop variable and fire with the wrong
  value
difficulty: easy
tags:
  - closures
  - var-scoping
  - correctness
language: javascript
---

## Context

This CLI tool schedules a series of reminder notifications, one per configured alert, each delayed by an increasing number of seconds. The intent is that the first alert fires after 1 s, the second after 2 s, and so on.

In practice every callback logs the same alert — always the last one in the array — regardless of which index triggered it.

## Buggy code

```javascript
const alerts = [
  { id: 1, message: "Check oven" },
  { id: 2, message: "Take medication" },
  { id: 3, message: "Stand-up call in 5 min" },
];

for (var i = 0; i < alerts.length; i++) {
  setTimeout(function () {
    console.log(`Alert ${alerts[i].id}: ${alerts[i].message}`);
  }, i * 1000);
}

console.log("All reminders scheduled.");
```
