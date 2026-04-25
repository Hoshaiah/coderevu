## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — All timer callbacks reference the same loop variable and fire with the wrong value
// ------------------------------------------------------------------------
const alerts = [
  { id: 1, message: "Check oven" },
  { id: 2, message: "Take medication" },
  { id: 3, message: "Stand-up call in 5 min" },
];

// CHANGE 1: replace `var i` with `let i` so each loop iteration gets its own block-scoped binding; callbacks now capture the correct per-iteration value of i.
// CHANGE 2: change delay from `i * 1000` to `(i + 1) * 1000` so the first alert fires after 1 s, the second after 2 s, etc.
for (let i = 0; i < alerts.length; i++) {
  setTimeout(function () {
    console.log(`Alert ${alerts[i].id}: ${alerts[i].message}`);
  }, (i + 1) * 1000); // CHANGE 2: was `i * 1000`, now `(i + 1) * 1000`
}

console.log("All reminders scheduled.");
```

## Explanation

### Issue 1: `var` closes over shared loop variable

**Problem:** Every `setTimeout` callback logs the same alert — always the last one (`id: 3`). When any of the timers fires, `i` has already been incremented to `alerts.length` (3), so `alerts[3]` is `undefined` and the code throws, or if you check just the message, all three callbacks see index 3 regardless of which iteration scheduled them.

**Fix:** Replace `var i` with `let i` on the `for` loop declaration. The rest of the callback code is unchanged.

**Explanation:** `var` is function-scoped (or global-scoped here), meaning there is exactly one `i` variable shared across all iterations. By the time the first timer fires (even just 0 ms later), the loop has already run to completion and `i` equals `alerts.length`. All three callbacks read that same final value. `let` is block-scoped: each iteration of the loop creates a fresh binding for `i` initialized to that iteration's value, so each callback captures its own independent copy. A related pitfall: if you need to use `var` for compatibility reasons, the traditional workaround is an IIFE — `(function(j){ setTimeout(...uses j...) })(i)` — which creates a new scope per iteration the same way `let` does.

---

### Issue 2: First alert fires immediately instead of after 1 s

**Problem:** The intent is for alert 0 to fire after 1 s, alert 1 after 2 s, and alert 2 after 3 s. Instead, with `i * 1000` the first `setTimeout` is called with a delay of `0 * 1000 = 0`, so it fires essentially immediately (in the same event-loop turn), and the last alert fires after only 2 s instead of 3 s.

**Fix:** Change the delay argument from `i * 1000` to `(i + 1) * 1000`, shifting all delays up by one second.

**Explanation:** Array indices start at 0, so `i` runs 0, 1, 2. Multiplying by 1000 gives delays of 0 ms, 1000 ms, and 2000 ms. Adding 1 before the multiplication shifts the sequence to 1000 ms, 2000 ms, 3000 ms, matching the stated requirement. A delay of 0 ms does not mean synchronous execution — the callback still runs asynchronously after the current call stack clears — but it fires far sooner than intended and can race with setup code that runs after the loop.
