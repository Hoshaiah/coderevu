## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — User-supplied input to a vulnerable regex causes catastrophic backtracking and hangs the server
// ------------------------------------------------------------------------
app.post("/subscribe", express.json(), (req, res) => {
  const { email } = req.body;

  // CHANGE 2: Guard against missing or non-string input before testing the regex.
  if (typeof email !== "string" || email.length === 0) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  // CHANGE 1: Replace the nested-quantifier regex that allowed ReDoS with a linear, possessive-free pattern. The old regex had ([a-zA-Z0-9]+([.-_]?...)*)+ where the outer + and inner * could cooperate on a failed match to explore an exponential number of split points. The new regex uses a simple local-part@domain structure with no nested repetition groups.
  const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._%+\-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  db.subscribers.insert({ email }).then(() => {
    res.status(201).json({ message: "Subscribed" });
  });
});
```

## Explanation

### Issue 1: Nested quantifiers enable ReDoS

**Problem:** The regex `/^([a-zA-Z0-9]+([.\-_]?[a-zA-Z0-9]+)*)+@.../` has an outer `+` wrapping a group that itself contains a `*`. When the regex engine tries to match a string like `aaaaaaaaaaaaaaaa@` and fails, it must explore every way to split the repeated characters between the outer and inner quantifiers. The number of possible splits grows exponentially with input length, so a ~20-character crafted local-part pins one CPU core for seconds and blocks Node's single-threaded event loop entirely.

**Fix:** Replace the entire `emailRegex` pattern (CHANGE 1) with `/^[a-zA-Z0-9]([a-zA-Z0-9._%+\-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/`. This pattern has no nested repetition groups — every quantifier operates on a flat character class, so the engine can fail in linear time.

**Explanation:** ReDoS happens when a regex can match the same substring in multiple ways; on failure the engine backtracks through all of them. The original pattern `([a-zA-Z0-9]+([.\-_]?[a-zA-Z0-9]+)*)+` lets the engine choose, for any run of alphanumeric chars, how many chars the outer group consumes versus how many the inner `*` consumes — that is exponential in the length of the run. The fix avoids this by writing the local-part as a single bounded character class `[a-zA-Z0-9._%+\-]{0,62}` with no group nesting, so there is only one way to match any given substring. A related pitfall: even a "safe" regex can become vulnerable if you later add a group wrapper around it, so keep repetition groups flat and avoid nesting `+` inside `*` or vice versa.

---

### Issue 2: Missing type guard on user input

**Problem:** If the POST body omits the `email` field, `email` is `undefined`. Calling `emailRegex.test(undefined)` coerces the argument to the string `"undefined"`, which happens to pass a lax regex. A `null` value or an object would similarly produce surprising coercion results rather than an immediate rejection.

**Fix:** Add a `typeof email !== "string" || email.length === 0` guard (CHANGE 2) before the regex test, returning a 400 immediately if the value is not a non-empty string.

**Explanation:** `RegExp.prototype.test` calls `ToString()` on its argument, so `test(undefined)` tests the literal string `"undefined"`. Depending on the regex, that string might or might not match, producing inconsistent behavior — in this case the old regex would reject it, but a slightly different pattern could accept it and insert the string `"undefined"` into the database. Checking `typeof` first is explicit, avoids any coercion, and makes the failure mode obvious when reading the code. It also protects against an array or object being passed in the JSON body, which `express.json()` happily parses without validating field types.
