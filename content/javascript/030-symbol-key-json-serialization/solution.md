## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Symbol Keys Lost in Serialization
// ------------------------------------------------------------------------

const ROLE_KEY = Symbol("role");

// CHANGE 2: Added explicit `role` string property to the interface so the field is a named key that JSON.stringify includes, not a symbol key that it drops.
interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  [key: symbol]: string;
}

function buildSession(userId: string, email: string, role: string): SessionPayload {
  // CHANGE 1: Assign role to the named string property `role` instead of the symbol key ROLE_KEY; JSON.stringify ignores symbol-keyed properties entirely, so using the string key ensures the field appears in the serialized output.
  const session: SessionPayload = { userId, email, role };
  session[ROLE_KEY] = role; // Symbol key retained for middleware that reads it pre-serialization
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

## Explanation

### Issue 1: Symbol Keys Dropped by JSON.stringify

**Problem:** Every client receives a response body that is missing the `role` field entirely. The server-side middleware reads `session[ROLE_KEY]` correctly before serialization, but `res.json()` calls `JSON.stringify` internally, and that function skips all symbol-keyed properties by design — they are never written to the output string.

**Fix:** At the `buildSession` call site, `role` is now passed as part of the object literal `{ userId, email, role }`, assigning it to the named string property `role` declared in the updated interface. The symbol key assignment is kept for the middleware that reads it before serialization.

**Explanation:** The ECMAScript specification explicitly states that `JSON.stringify` omits properties whose keys are Symbols. This is not a TypeScript restriction — TypeScript compiles away and the runtime behavior is pure JavaScript. Because `ROLE_KEY` is a `Symbol`, `session[ROLE_KEY] = role` stores the value under a key that `JSON.stringify` will never visit. The middleware reads the symbol key before `res.json` is called, so it works fine there. Once `JSON.stringify` runs, the symbol key is invisible, producing output with no `role` field. Assigning `role` to the named string property `role` in the object literal means `JSON.stringify` sees a normal enumerable string key and includes it in the output. The symbol key can stay on the object in parallel — the two assignments coexist without conflict.

---

### Issue 2: Interface Lacks Named role Property

**Problem:** The `SessionPayload` interface only has `userId` and `email` as named string properties, plus a symbol index signature. Nothing in the type contract expresses that `role` should be a serializable named field, so TypeScript raises no error when the developer stores role only under the symbol key.

**Fix:** A named `role: string` property is added to the `SessionPayload` interface (the `CHANGE 2` site), making the string-keyed field part of the explicit contract alongside `userId` and `email`.

**Explanation:** TypeScript's symbol index signature `[key: symbol]: string` lets any symbol be used as a key with a string value — it is analogous to a string index signature. It does not require any particular symbol key to exist; it only constrains the value type when one is used. Because the interface had no named `role` property, TypeScript was perfectly happy with the object `{ userId, email }` and saw the symbol assignment as the intended storage mechanism. Adding `role: string` as a named property means TypeScript will enforce that `role` is provided wherever a `SessionPayload` is constructed, catching future omissions at compile time and making the serialization intent clear in the type itself.
