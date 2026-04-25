## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Thrown Error Escapes Promise Chain
// ------------------------------------------------------------------------

const fs = require('fs');
const legacyParser = require('legacy-config-parser');

function parseConfig(filePath) {
  return new Promise((resolve, reject) => {
    // CHANGE 1: Moved fs.readFileSync and JSON.parse inside the executor so any synchronous throw is caught by the Promise machinery and turned into a rejection instead of escaping to the caller.
    let schema;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      schema = JSON.parse(raw); // CHANGE 2: JSON.parse now runs inside try/catch inside the executor; a malformed-JSON throw calls reject() rather than propagating synchronously.
    } catch (syncErr) {
      return reject(syncErr);
    }

    legacyParser.parse(schema, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

module.exports = { parseConfig };
```

## Explanation

### Issue 1: Synchronous throw escapes Promise executor

**Problem:** `JSON.parse(raw)` sits before the `new Promise(...)` call. When the file contains malformed JSON, `JSON.parse` throws synchronously, the exception bubbles up through `parseConfig`, and it is never caught by the Promise machinery. Callers that `await parseConfig(path)` inside a `try/catch` never reach the `catch` block because the throw happens before a Promise is even constructed.

**Fix:** The `JSON.parse` call (and the surrounding `try/catch`) is moved inside the `Promise` executor. When `JSON.parse` throws, the `catch` block calls `reject(syncErr)`, converting the failure into a proper rejection.

**Explanation:** The Promise constructor only catches synchronous exceptions that are thrown *inside* the executor function itself — not from code that runs before `new Promise(...)` is invoked. Because `JSON.parse` ran in the outer function scope, any throw it produced was an ordinary uncaught exception from the perspective of the call stack. Moving it inside the executor puts it under the constructor's own implicit try/catch, so the Promise is created in a rejected state and `await` surfaces that as a catchable error. A related pitfall: the same applies to any synchronous validation or transformation you do on `schema` before handing it to `legacyParser` — keep that work inside the executor too.

---

### Issue 2: fs.readFileSync throw also escapes the Promise

**Problem:** `fs.readFileSync` is called outside the Promise constructor for the same reason as `JSON.parse`. If the file does not exist or is unreadable, `readFileSync` throws an `ENOENT` or `EACCES` synchronously, and that exception also escapes the promise chain entirely.

**Fix:** `fs.readFileSync` is moved inside the executor's `try` block alongside `JSON.parse`. Both synchronous operations are now wrapped in the same `try/catch`, and any error from either one is forwarded to `reject(syncErr)`.

**Explanation:** `fs.readFileSync` throws rather than calling a callback, so it needs the same treatment as `JSON.parse`. Because both calls are now inside one `try/catch` inside the executor, a single error path covers all synchronous failure modes before the async `legacyParser.parse` call begins. The `return reject(syncErr)` pattern ensures the executor exits immediately after rejecting, preventing `legacyParser.parse` from being called with an undefined or invalid `schema`.
