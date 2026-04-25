## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — IndexedDB Store Created Outside Upgrade
// ------------------------------------------------------------------------

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('offlineCache', 1);

    request.onerror = () => reject(request.error);

    // CHANGE 1: Move store creation into onupgradeneeded, which is the only context where createObjectStore is legal (runs inside a version-change transaction on first install or version bump).
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('responses')) {
        db.createObjectStore('responses', { keyPath: 'url' });
      }
    };

    // CHANGE 2: onsuccess now only resolves the db — no createObjectStore call here, so no suppressed exception and no missing store on repeat visits.
    request.onsuccess = (event) => {
      const db = event.target.result;
      resolve(db);
    };
  });
}

export async function getCached(url) {
  const db = await initDB();
  const tx = db.transaction('responses', 'readonly');
  const store = tx.objectStore('responses');
  return new Promise((resolve, reject) => {
    const req = store.get(url);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
```

## Explanation

### Issue 1: `createObjectStore` Called Outside Upgrade Transaction

**Problem:** On the very first visit the database does not exist yet, so IndexedDB fires `onupgradeneeded` before `onsuccess`. The store creation code is inside `onsuccess`, which runs on every open — but `createObjectStore` is only legal during a version-change transaction. On the first visit the store happens to get created because `onupgradeneeded` implicitly runs the upgrade transaction, yet on every subsequent visit `onsuccess` fires without an upgrade transaction, `createObjectStore` throws `DOMException: The database is not running a version change transaction`, and no store exists. The result is an `offlineCache` database with zero object stores.

**Fix:** Move the `if (!db.objectStoreNames.contains('responses')) { db.createObjectStore(...) }` block into a new `request.onupgradeneeded` handler (CHANGE 1) and remove that logic from `request.onsuccess` (CHANGE 2), leaving `onsuccess` to do nothing but `resolve(db)`.

**Explanation:** IndexedDB version-change transactions are the only context where the schema (object stores, indexes) may be mutated. `onupgradeneeded` fires when the database is opened with a version number higher than the stored version — including when the database does not exist yet (stored version is 0, requested version is 1). `onsuccess` fires after the upgrade transaction commits, or immediately on repeat opens where no version change is needed; at that point no version-change transaction is active, so `createObjectStore` is forbidden. Moving the call to `onupgradeneeded` means it runs exactly once per version bump, under the correct transaction, and never runs again on subsequent opens. A related pitfall: if you later need to add a second store, increment the version number to 2 and add another branch inside `onupgradeneeded`; attempting to call `createObjectStore` for the new store in `onsuccess` at version 2 would reproduce this exact bug.

---

### Issue 2: `try/catch` Suppression Masks the Symptom Without a Fix

**Problem:** After the developer wrapped `createObjectStore` in `try/catch` to silence the console error, the app appeared healthier but broke silently in a different way. Every call to `getCached` or the equivalent `put` helper now throws `DOMException: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found` because the `responses` store never actually existed.

**Fix:** Removing the `try/catch` wrapper and instead placing `createObjectStore` in `onupgradeneeded` (CHANGE 1 and CHANGE 2) eliminates the need for error suppression entirely — the call is now always valid, so no exception is thrown.

**Explanation:** Swallowing an exception with `try/catch` does not undo the side-effect that caused the exception; it just prevents the program from knowing something went wrong. Here, the exception was a symptom of calling an API in the wrong lifecycle callback. Catching it left the database schema uncreated while letting execution continue as if everything succeeded. Downstream calls then tried to open a transaction against a store name that does not exist in the database, producing a second, harder-to-diagnose error. The correct response to a `DOMException` on `createObjectStore` is to fix the callback placement, not to hide the error. As a general rule, suppressing exceptions from browser storage APIs without logging or alerting makes silent data loss very hard to debug in production.
