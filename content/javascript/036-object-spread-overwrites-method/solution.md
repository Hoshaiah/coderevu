## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Spread Silently Drops Class Methods
// ------------------------------------------------------------------------

class Session {
  constructor(userId, data = {}) {
    this.userId = userId;
    this.data = data;
    this.lastSeen = Date.now();
  }

  touch() {
    this.lastSeen = Date.now();
  }

  isExpired(ttlMs) {
    return Date.now() - this.lastSeen > ttlMs;
  }
}

function createSession(userId) {
  return new Session(userId);
}

function mergeSessionData(session, incomingData) {
  // CHANGE 1: Instead of spreading into a plain object (which drops prototype methods), copy own properties onto a proper Session instance so touch() and isExpired() remain available.
  // CHANGE 2: Using Object.assign onto a real Session instance preserves the prototype chain, keeping instanceof checks and all inherited methods intact.
  const merged = new Session(session.userId, { ...session.data, ...incomingData });
  merged.lastSeen = session.lastSeen;
  return merged;
}

module.exports = { createSession, mergeSessionData };
```

## Explanation

### Issue 1: Spread strips prototype methods

**Problem:** After `mergeSessionData` runs, calling `session.touch()` throws `session.touch is not a function`. This happens intermittently because only sessions that have passed through `mergeSessionData` are affected; freshly created sessions work fine.

**Fix:** Replace the `{ ...session, ... }` spread with `new Session(session.userId, { ...session.data, ...incomingData })` and restore `lastSeen` via direct assignment. This ensures the returned value is a real `Session` instance with all prototype methods.

**Explanation:** The object spread operator (`{ ...session }`) copies only the object's own enumerable *data* properties — `userId`, `data`, `lastSeen` — into a brand-new plain object literal. Methods like `touch` and `isExpired` live on `Session.prototype`, not on the instance itself, so they are never copied. The result looks like a session (it has the right fields) but is just a `{}` with no prototype methods. Constructing a `new Session(...)` instead creates an object whose prototype chain includes `Session.prototype`, so all methods are available. A related pitfall: if you later add a getter or non-enumerable property to `Session`, spread will silently drop those too.

---

### Issue 2: Spread result breaks instanceof checks

**Problem:** Any code that does `if (session instanceof Session)` will return `false` for objects returned by the old `mergeSessionData`, potentially causing auth or type-guard logic elsewhere to silently misclassify the session.

**Fix:** Because `CHANGE 2` constructs the merged value with `new Session(...)`, the returned object's prototype chain runs through `Session.prototype`, so `instanceof Session` evaluates to `true` again.

**Explanation:** `instanceof` checks whether `Session.prototype` appears anywhere in the object's prototype chain. A plain object literal created by spread has `Object.prototype` as its only prototype, so `instanceof Session` is always `false` for it. This can be invisible during normal request handling if nothing currently checks `instanceof`, but future middleware or defensive guards may rely on it. Keeping the return value a genuine `Session` instance means the type contract of `createSession` and `mergeSessionData` stays consistent: callers always receive a `Session`, never a plain object that merely resembles one.
