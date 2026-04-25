---
slug: symbol-key-json-serialization
track: javascript
orderIndex: 30
title: Symbol Keys Lost in Serialization
difficulty: easy
tags:
  - types
  - serialization
  - api
language: typescript
---

## Context

This lives in `src/api/session.ts`, a small utility that builds a session payload for a REST API. The team decided to use a `Symbol` as a key to store a private `role` field on the session object before handing it off to `res.json()`. A TypeScript interface allows this via an index signature, and the code compiles without errors.

Operators noticed that every client receives a response body with no `role` field, even though the server-side middleware reads it correctly before serialization. Logging the raw object in the handler shows the symbol key present; the serialized JSON body simply omits it.

The developer already ruled out the middleware stripping the field — adding a `console.log(JSON.stringify(session))` right before `res.json` confirms the key is gone at that point. No TypeScript errors are raised.

## Buggy code

```typescript
const ROLE_KEY = Symbol("role");

interface SessionPayload {
  userId: string;
  email: string;
  [key: symbol]: string;
}

function buildSession(userId: string, email: string, role: string): SessionPayload {
  const session: SessionPayload = { userId, email };
  session[ROLE_KEY] = role;
  return session;
}

app.get("/api/me", (req, res) => {
  const session = buildSession(
    req.user.id,
    req.user.email,
    req.user.role
  );

  // Middleware reads session[ROLE_KEY] here and authorizes correctly
  res.json(session);
});
```
