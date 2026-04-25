## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Response is sent before async work inside forEach completes
// ------------------------------------------------------------------------
app.post("/invites/send", async (req, res) => {
  const { userIds } = req.body;
  let sent = 0;

  // CHANGE 1: Replace forEach with Promise.all + map so the handler actually awaits every async callback before reading `sent` and sending the response.
  await Promise.all(
    userIds.map(async (id) => {
      // CHANGE 2: Let the error propagate out of the async callback so Express (or a try/catch) can catch it instead of it being silently swallowed.
      const user = await db.users.findById(id);
      await mailer.sendWelcome(user.email);
      sent += 1;
    })
  );

  res.json({ message: `Sent ${sent} emails` });
});
```

## Explanation

### Issue 1: forEach does not await async callbacks

**Problem:** The handler always responds with `"Sent 0 emails"` regardless of how many users are in `userIds`. The emails may still be sent eventually (if nothing crashes), but the count is wrong and the response arrives before any email work is done.

**Fix:** Replace `userIds.forEach(async ...)` with `await Promise.all(userIds.map(async ...))`. `map` collects the Promise each async callback returns, and `Promise.all` waits for all of them to settle before execution continues to `res.json`.

**Explanation:** `Array.prototype.forEach` calls its callback and discards the return value. When the callback is `async`, it returns a Promise, but `forEach` throws that Promise away without awaiting it. So the synchronous body of the route handler races ahead, reads `sent` before any increment has happened, and calls `res.json` with `0`. `map` collects those same Promises into an array, and `Promise.all` awaits the entire array, so the `await` on line one of the fix makes the outer `async` function pause until every inner async operation has resolved. One related pitfall: if `userIds` is very large, all DB and mailer calls fire concurrently; you can throttle them with a library like `p-limit` if that is a concern.

---

### Issue 2: Errors inside forEach callbacks are silently lost

**Problem:** If `db.users.findById` rejects (e.g., the user does not exist) or `mailer.sendWelcome` throws a network error, the rejection is attached to a Promise that nothing is observing. The user never gets an email, the caller gets a `200 OK` with a potentially wrong count, and no error is logged or surfaced.

**Fix:** Because the async callbacks are now inside `Promise.all` (CHANGE 1/CHANGE 2 together), any rejection inside a callback causes the `Promise.all` to reject, which propagates up through the `await` and becomes an unhandled error in the `async` route handler — where Express's error middleware (or a wrapping `try/catch`) can catch it and respond with an appropriate error status.

**Explanation:** Inside `forEach`, a rejected Promise has no parent chain listening to it; Node.js emits an `unhandledRejection` event, which by default prints a warning but does not crash the process (in older Node versions it is silently dropped entirely). With `Promise.all`, each inner Promise is registered as a member of the outer Promise, so the first rejection causes the outer Promise to reject immediately. That rejection travels up through `await Promise.all(...)` and, if uncaught, reaches Express's built-in async error handler (Express 5) or a `try/catch` you add. This means you can return a `500` response and log the real cause rather than confusing callers with a `200` that hides a partial failure.
