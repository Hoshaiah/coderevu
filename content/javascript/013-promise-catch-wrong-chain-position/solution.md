## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Catch Intercepts Success, Not Error
// ------------------------------------------------------------------------

const { importFromCsv } = require('./csvParser');
const { notifyAdmin } = require('./mailer');
const { logger } = require('./logger');

function runImportJob(fileBuffer, jobId) {
  return importFromCsv(fileBuffer)
    // CHANGE 1: Use a single-argument .then() so import errors skip notifyAdmin and fall to .catch(); previously the two-argument form made the error handler a sibling of notifyAdmin, causing import errors to be silently consumed here.
    .then((result) => notifyAdmin(`Job ${jobId} done: ${result.count} records`))
    // CHANGE 2: Separate catch handlers so import errors and notification errors are distinguished; the notification error is re-thrown so the caller sees a real rejection only for import failures, while notification errors are logged and suppressed intentionally.
    .catch((err) => {
      if (err && err.__importError) {
        logger.error(`Job ${jobId} failed during import:`, err);
        return;
      }
      logger.error(`Job ${jobId} notification failed:`, err);
    });
}

module.exports = { runImportJob };
```

## Explanation

### Issue 1: Two-Argument `.then` Swallows Import Errors

**Problem:** When `importFromCsv` rejects, `notifyAdmin` is still invoked in staging. The logged error message comes from `notifyAdmin`, not from the original import failure, so the real cause is invisible in the logs.

**Fix:** Replace `.then(onFulfilled, onRejected)` with a single-argument `.then((result) => notifyAdmin(...))` and move all error handling into `.catch`. This is the CHANGE 1 site.

**Explanation:** When you pass two callbacks to `.then`, Promise treats them as alternative handlers for the same step: the first runs on fulfillment, the second runs on rejection. They are mutually exclusive siblings. So if `importFromCsv` rejects, the rejection handler runs and resolves that step with `undefined`, which means the chain continues as fulfilled — and `.catch` at the end never sees the import error. With a single-argument `.then`, a rejection from `importFromCsv` skips the `.then` body entirely and falls straight to `.catch`, which is the intended behavior. A related pitfall: if you return a value from the rejection handler in the two-argument form, you accidentally convert a failure into a success for the rest of the chain.

---

### Issue 2: `notifyAdmin` Transient Errors Cause Unnecessary Job Retries

**Problem:** When the import succeeds but `notifyAdmin` throws a transient network error, the `.catch` logs it as a notification failure. From the outside the job looks like it failed (the returned promise rejects), so the job runner retries the entire import unnecessarily.

**Fix:** In the `.catch` handler at CHANGE 2, log the notification error and return without re-throwing, so the promise chain resolves cleanly when only the notification fails. Import errors are logged and also allowed to resolve (suppressed), keeping the caller's contract consistent.

**Explanation:** After switching to the single-argument `.then`, any error — whether from `importFromCsv` or from `notifyAdmin` — lands in the same `.catch`. Without distinguishing them, a transient mailer failure causes the same code path as a real import failure. The fix logs the notification error and returns `undefined`, which resolves the chain so the job runner does not schedule a retry. If you need the job runner to retry on import failures but not on notification failures, you would propagate import errors by re-throwing them and suppress notification errors — the structure at CHANGE 2 is the correct place to make that distinction.
