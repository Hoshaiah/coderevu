## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — hasOwnProperty Bypassed via Prototype
// ------------------------------------------------------------------------

/**
 * Checks whether a user's permission map contains a given permission.
 * @param {object} permissions - e.g. { read: true, write: false }
 * @param {string} permission
 * @returns {boolean}
 */
function hasPermission(permissions, permission) {
  // CHANGE 1: Replace `in` operator with `Object.prototype.hasOwnProperty.call()` to prevent prototype-chain keys like `__proto__` from matching, and CHANGE 2: call it via `Object.prototype` directly so it works on null-prototype objects too.
  return Object.prototype.hasOwnProperty.call(permissions, permission) && permissions[permission] === true;
}

function requirePermission(permission) {
  return (req, res, next) => {
    const userPermissions = req.user.permissions;
    if (!hasPermission(userPermissions, permission)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

module.exports = { hasPermission, requirePermission };
```

## Explanation

### Issue 1: `in` Operator Traverses Prototype Chain

**Problem:** The `in` operator returns `true` if the key exists anywhere on the object's prototype chain, not just as an own property. A request with `permission: "__proto__"` evaluates `'__proto__' in permissions` as `true` for any plain object, so the second condition `permissions['__proto__'] === true` then checks `Object.prototype.__proto__`, which is `null` — but an attacker can also craft keys like `toString` or `constructor` that exist on `Object.prototype` and may accidentally satisfy the `=== true` check if the prototype is tampered with via a separate prototype-pollution vector.

**Fix:** Replace `permission in permissions` with `Object.prototype.hasOwnProperty.call(permissions, permission)` at the `CHANGE 1` site. This restricts the lookup to own enumerable and non-enumerable properties on the object itself, excluding anything inherited.

**Explanation:** Every plain object in JavaScript inherits from `Object.prototype`, which carries properties like `toString`, `constructor`, and `__proto__`. The `in` operator walks the full prototype chain, so inherited keys pass the check. Switching to `hasOwnProperty` limits the lookup to properties set directly on `permissions`. An attacker sending `"__proto__"` no longer gets a match because `__proto__` is not an own property of the permissions object; it is a getter on `Object.prototype`. A related pitfall: do not rely on `typeof permissions.__proto__` either, since getters can be overridden.

---

### Issue 2: `hasOwnProperty` Breaks on Null-Prototype Objects

**Problem:** If `permissions` is created with `Object.create(null)`, it has no prototype at all. Calling `permissions.hasOwnProperty(key)` throws `TypeError: permissions.hasOwnProperty is not a function` because the method is not inherited. This was why the previous `hasOwnProperty` fix was reverted.

**Fix:** At the `CHANGE 2` site, call `Object.prototype.hasOwnProperty.call(permissions, permission)` instead of `permissions.hasOwnProperty(permission)`. This borrows the method directly from `Object.prototype` and invokes it with `permissions` as `this`, so the prototype of `permissions` is irrelevant.

**Explanation:** Null-prototype objects are a common pattern for safe key-value stores because they have no inherited keys at all, which actually makes them better for permission maps. But they also lack all the utility methods that live on `Object.prototype`. Using `Object.prototype.hasOwnProperty.call(target, key)` is the idiomatic way to perform an own-property check that works regardless of whether the target has a prototype. This is also safe against a prototype-pollution scenario where an attacker has replaced `permissions.hasOwnProperty` with a custom function, since you are always pulling the genuine built-in from `Object.prototype`.
