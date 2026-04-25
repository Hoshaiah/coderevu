---
slug: foreach-await
track: javascript
orderIndex: 1
title: "Response is sent before async work inside forEach completes"
difficulty: easy
tags: [async, promises, control-flow]
language: javascript
---

## Context

This Express handler is supposed to send a welcome email to every newly invited user and then respond with the count of emails sent. In practice the handler returns `"Sent 0 emails"` even when emails are actually being sent, and users sometimes never receive one.

## Buggy code

```javascript
app.post("/invites/send", async (req, res) => {
  const { userIds } = req.body;
  let sent = 0;

  userIds.forEach(async (id) => {
    const user = await db.users.findById(id);
    await mailer.sendWelcome(user.email);
    sent += 1;
  });

  res.json({ message: `Sent ${sent} emails` });
});
```
