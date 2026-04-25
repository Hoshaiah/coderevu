## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Unhandled Error Event Crashes Process
// ------------------------------------------------------------------------

const { pipeline, Transform } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

class UpperCaseTransform extends Transform {
  _transform(chunk, _enc, cb) {
    cb(null, chunk.toString().toUpperCase());
  }
}

async function processFile(downloadStream, uploadStream) {
  const transform = new UpperCaseTransform();

  // CHANGE 1: Attach a no-op 'error' listener to downloadStream before pipeline wires it up, preventing Node from throwing an uncaught exception if the stream emits an error before or after pipeline's own listeners are registered.
  downloadStream.on('error', (err) => { console.error('downloadStream pre-pipeline error:', err.message); });

  // CHANGE 2: Attach a no-op 'error' listener to uploadStream for the same reason — any error emitted outside pipeline's managed lifetime would otherwise crash the process.
  uploadStream.on('error', (err) => { console.error('uploadStream pre-pipeline error:', err.message); });

  try {
    await pipelineAsync(downloadStream, transform, uploadStream);
  } catch (err) {
    // CHANGE 3: Re-throw after logging so the caller can catch the error, skip this file, and keep the worker loop running instead of silently swallowing the failure.
    console.error('Pipeline failed:', err.message);
    throw err;
  }
}

module.exports = { processFile };
```

## Explanation

### Issue 1: Unhandled error event on downloadStream

**Problem:** The worker crashes with `ECONNRESET` or `ETIMEDOUT` originating from the download stream object. The `try/catch` around `pipelineAsync` is sometimes reached but the process still dies, meaning the error is not coming through the promise rejection path.

**Fix:** Add `downloadStream.on('error', ...)` before calling `pipelineAsync`, as shown at the CHANGE 1 site. This registers a listener so Node does not treat the event as unhandled.

**Explanation:** Node's `EventEmitter` contract says that if an `'error'` event is emitted and no listener is registered, the error is thrown as an uncaught exception and the process exits. `stream.pipeline` does register error listeners, but there is a race: if the stream emits `'error'` before `pipeline` wires itself up (or after it tears down in a cleanup path), no listener exists. Attaching your own listener first guarantees at least one listener is always present. The listener does not need to do anything complex — its existence alone prevents the crash. A related pitfall: even after `pipeline` resolves or rejects, Node may deliver a delayed error event from an underlying socket; the pre-registered listener catches that too.

---

### Issue 2: Unhandled error event on uploadStream

**Problem:** The same crash scenario applies to `uploadStream`. If the upload destination (S3 multipart upload, writable HTTP socket, etc.) emits an `'error'` event outside the window where `pipeline` holds a listener, the process exits with an uncaught exception.

**Fix:** Add `uploadStream.on('error', ...)` before calling `pipelineAsync`, as shown at the CHANGE 2 site, mirroring the fix for `downloadStream`.

**Explanation:** Writable streams connected to network resources can emit errors asynchronously — for example, an S3 SDK stream may emit an error when the connection drops mid-upload, slightly after `pipeline` has already called `destroy()` and removed its listeners. At that point the stream has no listeners and Node throws. Pre-registering a listener on `uploadStream` closes this window. The same pattern applies to any stream you pass into `pipeline` when those streams may have an independent lifetime around the pipeline call.

---

### Issue 3: Swallowed error prevents worker loop from recovering

**Problem:** The `catch` block logs the error but does not re-throw it. The caller of `processFile` receives a resolved promise regardless of whether the pipeline succeeded. The worker loop has no signal to skip the bad file, so it may retry the same file endlessly or silently drop messages without moving on.

**Fix:** Add `throw err` inside the `catch` block at the CHANGE 3 site, after the `console.error` call, so the async function rejects and the caller sees the failure.

**Explanation:** When you `await processFile(...)` in the worker loop and the function catches-but-swallows the error, the awaited promise resolves with `undefined`. The loop treats this as success and may acknowledge the queue message, losing it permanently, or loop back and re-download the same file. Re-throwing lets the caller decide the retry or dead-letter strategy. The logging stays in `processFile` so the low-level context (stream type, message) is recorded before the error propagates up to higher-level handlers.
