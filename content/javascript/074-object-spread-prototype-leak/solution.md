## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Prototype Methods Leaked via Spread
// ------------------------------------------------------------------------

const ALLOWED_KEYS = ["name", "email", "message"];

/**
 * Returns a sanitised copy of the request body containing only allowed keys.
 */
function sanitize(body) {
  // CHANGE 2: Use Object.create(null) so the accumulator has no prototype chain to pollute.
  const clean = Object.create(null);

  for (const key of ALLOWED_KEYS) {
    // CHANGE 2: Use Object.prototype.hasOwnProperty.call to ensure only own properties of body are read, preventing prototype-chain traversal via bracket notation.
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
      clean[key] = body[key];
    }
  }

  // CHANGE 1: Replace spread with Object.assign targeting a null-prototype object so __proto__ and constructor keys are never interpreted as prototype-modifying instructions.
  return Object.assign(Object.create(null), { name: "Anonymous", message: "" }, clean);
}

module.exports = { sanitize };
```

## Explanation

### Issue 1: Spread Operator Enables Prototype Pollution

**Problem:** When the spread `{ ...defaults, ...clean }` executes and `clean` contains a key literally named `__proto__`, the JavaScript engine interprets that key as a directive to set the prototype of the newly created object literal, rather than storing it as a plain property. An attacker POST body like `{"__proto__":{"isAdmin":true}}` survives `sanitize` and the returned object's prototype is mutated, so every subsequent plain object in the process inherits `isAdmin: true`.

**Fix:** Replace the spread expression with `Object.assign(Object.create(null), { name: "Anonymous", message: "" }, clean)`. `Object.create(null)` produces a target with no prototype, and `Object.assign` copies enumerable own properties without triggering prototype-assignment semantics for `__proto__`.

**Explanation:** Object literal spread `{ ...x }` is syntactic sugar that calls the internal `CopyDataProperties` operation, which does honour `__proto__` as a special setter on the target object literal. `Object.assign`, by contrast, uses `[[Set]]` on each key but because the target was created with `Object.create(null)` there is no `__proto__` setter to invoke, so the key either becomes a harmless own property or is simply absent. A related pitfall: a key named `constructor` with a crafted value can also cause problems with spread on regular object literals, and the `Object.create(null)` target neutralises that as well.

---

### Issue 2: Bracket Notation Reads Inherited Properties

**Problem:** `body[key]` traverses the full prototype chain of `body`. If an attacker has already polluted `Object.prototype` before `sanitize` runs (possible through other vectors in the same process), a key like `name` might exist on the prototype and pass the `!== undefined` guard even though `body` has no own property named `name`. The polluted value then gets written into `clean` and persisted.

**Fix:** Add `Object.prototype.hasOwnProperty.call(body, key)` as a guard before reading `body[key]`, and initialise `clean` with `Object.create(null)` so the accumulator itself has no prototype chain that could be walked or modified.

**Explanation:** `body['name']` returns the first `name` found anywhere on `body`'s prototype chain, not just `body` itself. Calling `Object.prototype.hasOwnProperty.call(body, key)` explicitly checks only the object's own enumerable and non-enumerable properties without touching the chain. Using `Object.create(null)` for `clean` means assignments into `clean` cannot accidentally collide with built-in `Object.prototype` properties like `toString` or `valueOf`. Note that `body.hasOwnProperty(key)` looks equivalent but is itself unsafe: if `body.__proto__` was replaced, `body.hasOwnProperty` might not be the real method, so the indirect call via `Object.prototype.hasOwnProperty.call` is the safe pattern.
