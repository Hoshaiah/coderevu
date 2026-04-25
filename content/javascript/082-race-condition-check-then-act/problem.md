---
slug: race-condition-check-then-act
track: javascript
orderIndex: 82
title: >-
  Username uniqueness check has a TOCTOU race that allows duplicate
  registrations under concurrency
difficulty: hard
tags:
  - concurrency
  - race-condition
  - database
language: javascript
---

## Context

This registration handler enforces unique usernames by first querying the database for an existing user and then inserting if none is found. It uses a plain SQL client (no ORM) against a PostgreSQL database.

The users table has no unique index on the `username` column because the app relies on this handler to enforce uniqueness. Under moderate concurrent load, duplicate usernames appear in the database.

## Buggy code

```javascript
app.post("/register", express.json(), async (req, res) => {
  const { username, password } = req.body;

  const existing = await db.query(
    "SELECT id FROM users WHERE username = $1",
    [username]
  );

  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const hashed = await bcrypt.hash(password, 12);

  const result = await db.query(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
    [username, hashed]
  );

  res.status(201).json({ id: result.rows[0].id });
});
```
