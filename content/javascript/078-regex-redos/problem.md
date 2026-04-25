---
slug: regex-redos
track: javascript
orderIndex: 78
title: >-
  User-supplied input to a vulnerable regex causes catastrophic backtracking and
  hangs the server
difficulty: hard
tags:
  - security
  - performance
  - regex
  - redos
language: javascript
---

## Context

This Express endpoint validates that an email address looks well-formed before inserting it into the database. The regex was copied from a Stack Overflow answer years ago and has been in production ever since.

Ops recently noticed that certain POST requests cause 100% CPU usage for tens of seconds, blocking the entire event loop. A single such request makes the API unresponsive for all other clients.

## Buggy code

```javascript
app.post("/subscribe", express.json(), (req, res) => {
  const { email } = req.body;

  const emailRegex = /^([a-zA-Z0-9]+([.\-_]?[a-zA-Z0-9]+)*)+@([a-zA-Z0-9]+([.\-]?[a-zA-Z0-9]+)*)+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  db.subscribers.insert({ email }).then(() => {
    res.status(201).json({ message: "Subscribed" });
  });
});
```
