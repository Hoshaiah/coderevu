---
slug: prototype-pollution-merge
track: javascript
orderIndex: 77
title: >-
  Deep-merge utility lets attacker inject properties onto Object.prototype via
  crafted JSON
difficulty: hard
tags:
  - security
  - prototype-pollution
  - object-manipulation
language: javascript
---

## Context

This utility function is used throughout a SaaS app to deep-merge user-supplied configuration objects (parsed from JSON) with server-side defaults. It runs in a Node.js background worker that processes webhook payloads.

A penetration tester demonstrated that sending a payload containing `__proto__` as a key causes subsequently created plain objects to have unexpected properties, leading to privilege escalation.

## Buggy code

```javascript
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

app.post("/webhook", express.json(), (req, res) => {
  const config = deepMerge({}, req.body);
  processJob(config);
  res.sendStatus(200);
});
```
