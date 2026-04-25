---
slug: promise-then-return-missing
track: javascript
orderIndex: 6
title: Unchained Promise Swallows DB Error
difficulty: easy
tags:
  - async
  - promises
  - error-handling
language: javascript
---

## Context

This file lives in `src/api/users.js` and provides an Express route that updates a user's email address and returns the updated record. The service uses a Knex-based database layer where every method returns a Promise.

Operators notice that the endpoint occasionally responds with `200 OK` and `{ success: true }` even when the database update fails — for example, when a unique-constraint violation occurs because another user already owns that email. The duplicate email ends up silently rejected, and the caller has no idea.

The developer added a `.catch` to handle the DB error but the response still comes back successful. Removing the `.catch` entirely doesn't change the observable behaviour, which is confusing.

## Buggy code

```javascript
app.put('/users/:id/email', (req, res) => {
  const { id } = req.params;
  const { email } = req.body;

  db('users')
    .where({ id })
    .update({ email })
    .then((rows) => {
      res.json({ success: true, updated: rows });
    })
    .catch((err) => {
      console.error('DB update failed:', err.message);
    });

  res.json({ success: true });
});
```
