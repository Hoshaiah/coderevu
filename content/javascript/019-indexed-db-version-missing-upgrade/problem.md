---
slug: indexed-db-version-missing-upgrade
track: javascript
orderIndex: 19
title: IndexedDB Store Created Outside Upgrade
difficulty: hard
tags:
  - async
  - api-misuse
  - correctness
language: javascript
---

## Context

This module is `src/storage/offlineCache.js`. It manages an IndexedDB database for caching API responses in a Progressive Web App. The `initDB` function opens the database and creates an object store for cached responses if one does not already exist. The code was written by a developer who was familiar with localStorage but new to IndexedDB.

On first install everything works, but on returning visits (when the database already exists) the app silently fails to store or retrieve cached data. In Chrome DevTools > Application > IndexedDB, the `offlineCache` database exists but contains no object stores. Console errors like `DOMException: Failed to execute 'createObjectStore' on 'IDBDatabase': The database is not running a version change transaction` appear on repeat visits.

The developer tried wrapping the `createObjectStore` call in a `try/catch` to suppress the error, which made the console clean but did not fix the missing store — subsequent `get` and `put` calls then throw `DOMException: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found`.

## Buggy code

```javascript
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('offlineCache', 1);

    request.onerror = () => reject(request.error);

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Create the store if it doesn't exist yet
      if (!db.objectStoreNames.contains('responses')) {
        db.createObjectStore('responses', { keyPath: 'url' });
      }

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
