## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Sync Exception Escapes Promise Chain
// ------------------------------------------------------------------------

const fs = require("fs/promises");

function parseManifest(raw) {
  // May throw SyntaxError synchronously for malformed JSON
  return JSON.parse(raw);
}

// CHANGE 1 & 2: Replace `new Promise(async executor)` with a plain async function so synchronous throws from parseManifest propagate as rejections automatically, without the Promise constructor swallowing them.
async function runImport(jobId, s3Path) {
  const raw = await fs.readFile(s3Path, "utf8");
  const manifest = parseManifest(raw); // if this throws, the async function rejects cleanly
  const records = manifest.records;
  return records.length;
}

// Top-level usage
runImport("job-42", "/tmp/manifest.json")
  .then((count) => console.log(`Imported ${count} records`))
  .catch((err) => console.error("Job failed:", err.message));
```

## Explanation

### Issue 1: Async Executor Swallows Synchronous Throws

**Problem:** When `parseManifest` throws a `SyntaxError`, the process crashes with an unhandled exception instead of the top-level `.catch` logging it as a failed job. About 2% of jobs hit malformed JSON, so this crash rate matches exactly.

**Fix:** Remove the `new Promise(async (resolve, reject) => { ... })` wrapper entirely and replace it with a plain `async function runImport(...)`. The `return records.length` replaces `resolve(records.length)` at the CHANGE 1 & 2 site.

**Explanation:** When you write `new Promise(async (resolve, reject) => { ... })`, the `Promise` constructor calls the executor synchronously and expects it to call `resolve` or `reject`. Because the executor is declared `async`, it immediately returns its own implicit Promise — one that the `Promise` constructor ignores completely. If the async executor's body throws (or a `Promise` it `await`s rejects), that error goes to the ignored inner Promise, not to `reject`. The outer Promise therefore never settles as rejected, and Node.js sees an unhandled rejection on the inner Promise, which in modern Node.js versions causes a process crash. A plain `async function` does not have this problem: any thrown error or rejected `await` inside it automatically rejects the Promise that the function returns, so the chained `.catch` receives it correctly.

---

### Issue 2: Unnecessary `new Promise` Anti-Pattern Around Async Code

**Problem:** Wrapping an `async` function body inside `new Promise()` adds complexity without benefit. Every `await` inside the executor already works with native Promise semantics, so the manual `resolve`/`reject` calls are redundant and error-prone, as shown by Issue 1.

**Fix:** Declare `runImport` directly as `async function runImport(jobId, s3Path)` and `return records.length` instead of calling `resolve(records.length)`. The `new Promise` wrapper and its executor arguments are deleted at the CHANGE 1 & 2 site.

**Explanation:** The `new Promise` constructor (the "explicit Promise construction" pattern) is meant for wrapping callback-based APIs that have no native Promise support. When the function body already uses `await`, the async function's built-in Promise handling does everything `new Promise` would do — it resolves on `return` and rejects on `throw` or a rejected `await`. Adding `new Promise` on top introduces an extra layer that is both redundant and dangerous, because the mismatch between the constructor's synchronous executor contract and the async executor's deferred execution creates the exact swallowing bug described in Issue 1. Removing the wrapper makes the control flow explicit and correct with fewer lines of code.
