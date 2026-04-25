## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Unchained Promise Swallows DB Error
// ------------------------------------------------------------------------

app.put('/users/:id/email', (req, res) => {
  const { id } = req.params;
  const { email } = req.body;

  db('users')
    .where({ id })
    .update({ email })
    .then((rows) => {
      res.json({ success: true, updated: rows });
    })
    // CHANGE 2: send an error response instead of silently logging, so the client learns the update failed.
    .catch((err) => {
      console.error('DB update failed:', err.message);
      res.status(500).json({ success: false, error: err.message });
    });

  // CHANGE 1: removed the unconditional res.json() that was here — it fired synchronously before the Promise settled, always returning 200 OK regardless of DB outcome.
});
```

## Explanation

### Issue 1: Unconditional Response Fires Before Promise Settles

**Problem:** The endpoint always responds with `200 OK` and `{ success: true }` immediately, before the database operation finishes. The operator sees a success response even when the update throws a unique-constraint violation.

**Fix:** The line `res.json({ success: true });` that appeared after the Promise chain (outside `.then`/`.catch`) is removed entirely. The only response calls now live inside `.then` and `.catch`.

**Explanation:** JavaScript's event loop runs synchronous code to completion before any Promise callbacks fire. When the handler executes, it starts the Knex Promise, then immediately hits the bare `res.json({ success: true })` call and sends the HTTP response. By the time the Promise resolves or rejects, the response is already gone. The `.catch` handler still runs and logs, but calling `res.json` a second time inside it either throws a "headers already sent" warning or is silently ignored by Express, depending on version. Moving all `res.json` calls into `.then` and `.catch` ensures the response is sent exactly once, only after the DB operation completes.

---

### Issue 2: `.catch` Logs the Error But Never Tells the Client

**Problem:** When a DB error occurs (for example, a duplicate-email constraint violation), the `.catch` handler prints to the server log but does not call `res.json` or `res.status`. The client receives no error — in fact, with Issue 1 in place, the client already received a 200 success before `.catch` even ran.

**Fix:** Inside `.catch`, after `console.error`, a call to `res.status(500).json({ success: false, error: err.message })` is added, so the client receives a 500 response with a machine-readable error body.

**Explanation:** A `.catch` handler that only logs is useful for observability but does nothing to inform the caller that the operation failed. The caller has no way to distinguish a successful update from a failed one if the HTTP status and body are identical in both cases. Adding `res.status(500).json(...)` inside `.catch` makes the failure visible to the client. One related pitfall: if you forget `return` before `res.json` in `.then` and then let the chain fall through to `.catch` for some other reason, you can end up calling `res.json` twice — always structure `.then` and `.catch` so only one path sends the response.
