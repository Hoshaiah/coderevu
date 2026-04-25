## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Deep-merge utility lets attacker inject properties onto Object.prototype via crafted JSON
// ------------------------------------------------------------------------
// CHANGE 1+2: helper that blocks both __proto__ and constructor/prototype pollution vectors
function isSafeKey(key) {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    // CHANGE 1: skip __proto__ key to prevent direct prototype pollution
    // CHANGE 2: skip constructor/prototype keys to prevent indirect prototype pollution
    if (!isSafeKey(key)) continue;

    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

app.post("/webhook", express.json(), (req, res) => {
  // CHANGE 3: use Object.create(null) as the merge base so it has no prototype to pollute even if a bypass is found; also validate req.body is a plain object
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.sendStatus(400);
  }
  const config = deepMerge(Object.create(null), req.body);
  processJob(config);
  res.sendStatus(200);
});
```

## Explanation

### Issue 1: Direct prototype pollution via `__proto__`

**Problem:** When the attacker sends JSON like `{"__proto__": {"isAdmin": true}}`, `Object.keys()` yields `"__proto__"` as a normal string key. Assigning `target["__proto__"]["isAdmin"] = true` writes onto `Object.prototype`, so every plain object created afterwards has `isAdmin === true`. The penetration tester used this to pass privilege checks that read `config.isAdmin`.

**Fix:** The `isSafeKey` guard added before the merge loop checks `key !== "__proto__"` and skips that key with `continue`, preventing the assignment from ever happening.

**Explanation:** In V8 (and all modern JS engines), `obj["__proto__"]` is a setter that walks up to `Object.prototype` and modifies it — it does not create an own property named `__proto__`. So the recursive `deepMerge(target["__proto__"], source["__proto__"])` is really merging into `Object.prototype` itself. Every subsequent `{}` literal or `new Object()` inherits those injected properties. Blocking the key before the assignment removes the only path to that setter. Note that `JSON.parse` does produce `__proto__` as an enumerable key, so the threat is real for any JSON input.

---

### Issue 2: Indirect prototype pollution via `constructor.prototype`

**Problem:** An attacker can send `{"constructor": {"prototype": {"isAdmin": true}}}`. The merge recurses into `target["constructor"]` (which is `Object` on a plain object) and then into `target["constructor"]["prototype"]` (which is `Object.prototype`), achieving the same pollution without touching `__proto__` at all.

**Fix:** `isSafeKey` also blocks `"constructor"` and `"prototype"` as standalone keys, so neither the first descent into `constructor` nor any direct assignment to `prototype` can occur.

**Explanation:** Because `target.constructor` resolves to the `Object` function via prototype lookup rather than as an own property, writing into it via bracket notation navigates to the real `Object` constructor. Then descending into `.prototype` reaches `Object.prototype` exactly as in Issue 1. The fix blocks both `"constructor"` and `"prototype"` because either key appearing at any nesting level can be part of this chain. A related pitfall: blocking only `__proto__` while leaving `constructor` open is a common incomplete fix, which is why both checks belong in the same helper.

---

### Issue 3: Merge base is `{}`, which has a live prototype

**Problem:** Even with key filtering, using `{}` as the merge base means the result object inherits from `Object.prototype`. If any future bypass is found (e.g., a new engine-specific property), the prototype is still reachable and mutable through the merged object.

**Fix:** The webhook handler now calls `Object.create(null)` instead of `{}` as the initial target passed to `deepMerge`, producing a truly prototype-free object. It also adds an early `typeof` check so non-object bodies are rejected with a 400 before reaching `deepMerge`.

**Explanation:** `Object.create(null)` creates an object with its internal `[[Prototype]]` slot set to `null`, so there is no `Object.prototype` chain to pollute. Even if a crafted key somehow slipped through the guard, the assignment would land on a dead-end object rather than the shared prototype. The body type check is a separate line of defence: `express.json()` can parse arrays and primitives as valid JSON, and passing those directly into `deepMerge` would cause unexpected behaviour since the function assumes `target` and `source` are both objects.
