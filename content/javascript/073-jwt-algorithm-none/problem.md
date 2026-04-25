---
slug: jwt-algorithm-none
track: javascript
orderIndex: 73
title: >-
  JWT verification accepts tokens signed with the 'none' algorithm, bypassing
  authentication
difficulty: medium
tags:
  - security
  - authentication
  - jwt
language: javascript
---

## Context

This middleware validates JWT bearer tokens on protected API routes. It is built with the popular `jsonwebtoken` npm package and is deployed in front of every admin endpoint.

A security audit found that an attacker can craft a token with `{ "alg": "none" }` in the header and an arbitrary payload, and the middleware will accept it as valid without any secret.

## Buggy code

```javascript
const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET;

function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing token" });

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
}

module.exports = requireAuth;
```
