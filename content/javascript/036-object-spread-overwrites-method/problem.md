---
slug: object-spread-overwrites-method
track: javascript
orderIndex: 36
title: Spread Silently Drops Class Methods
difficulty: easy
tags:
  - types
  - closures
  - api-misuse
language: javascript
---

## Context

This helper lives in `src/store/sessionStore.js` and manages a session object that is passed around to middleware in a Node.js/Express application. The session has a `touch()` method that updates the `lastSeen` timestamp. Middleware is supposed to call `session.touch()` on each authenticated request to keep the session alive.

Ops reports that sessions expire prematurely even for active users. Adding logging shows `session.touch is not a function` appearing intermittently — but not always, which makes it hard to reproduce.

Debugging shows the error only appears after the session has been through the `mergeSessionData` function. Sessions that are freshly created from `createSession` work fine.

## Buggy code

```javascript
class Session {
  constructor(userId, data = {}) {
    this.userId = userId;
    this.data = data;
    this.lastSeen = Date.now();
  }

  touch() {
    this.lastSeen = Date.now();
  }

  isExpired(ttlMs) {
    return Date.now() - this.lastSeen > ttlMs;
  }
}

function createSession(userId) {
  return new Session(userId);
}

function mergeSessionData(session, incomingData) {
  // Merge new data into the session without mutating the original
  return { ...session, data: { ...session.data, ...incomingData } };
}

module.exports = { createSession, mergeSessionData };
```
