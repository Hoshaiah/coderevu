## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — File download handler crashes the Node process when the source stream emits an error
// ------------------------------------------------------------------------
const fs = require("fs");
const path = require("path");

app.get("/downloads/:filename", (req, res) => {
  // CHANGE 2: Resolve and validate the path before use to prevent directory traversal.
  const filesDir = path.resolve(__dirname, "files");
  const filePath = path.resolve(filesDir, req.params.filename);

  // CHANGE 2: Reject any path that escapes the intended directory.
  if (!filePath.startsWith(filesDir + path.sep) && filePath !== filesDir) {
    res.status(400).send("Invalid filename.");
    return;
  }

  res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
  res.setHeader("Content-Type", "application/octet-stream");

  const readStream = fs.createReadStream(filePath);

  // CHANGE 1: Attach an 'error' listener so stream errors are handled instead of propagating as uncaught exceptions that kill the process.
  readStream.on("error", (err) => {
    if (!res.headersSent) {
      if (err.code === "ENOENT") {
        res.status(404).send("File not found.");
      } else if (err.code === "EACCES") {
        res.status(403).send("Access denied.");
      } else {
        res.status(500).send("Error reading file.");
      }
    } else {
      // Headers already sent; destroy the response to signal an incomplete transfer.
      res.destroy();
    }
  });

  readStream.pipe(res);
});
```

## Explanation

### Issue 1: Unhandled stream error crashes the process

**Problem:** When `fs.createReadStream` encounters an error after the stream is created — for example `ENOENT` if the file disappears between the request arriving and the read starting, or `EACCES` if permissions are wrong — Node emits an `'error'` event on the stream. Because there is no listener, Node treats it as an uncaught exception and terminates the process. Ops sees the server die once a day exactly because of this.

**Fix:** Add a `readStream.on("error", (err) => { ... })` listener (CHANGE 1) that sends an appropriate HTTP error status when headers have not yet been sent, or calls `res.destroy()` when they have (meaning partial data was already written).

**Explanation:** In Node, every `EventEmitter` that emits `'error'` with no registered listener throws the error synchronously into the event loop as an uncaught exception. For a stream, this happens on the next I/O tick after the bad file descriptor or missing path is detected, which is after `pipe` has been called. The `'error'` listener intercepts it at the emitter level before it propagates. The `headersSent` guard matters because once response headers are flushed to the client you cannot call `res.status()` again — doing so silently fails or throws a second error; calling `res.destroy()` instead closes the TCP connection and signals to the client that the transfer was incomplete.

---

### Issue 2: Path traversal allows access outside the 'files' directory

**Problem:** `req.params.filename` is used directly in `path.join`. A caller can send a request like `GET /downloads/../../etc/passwd`, and `path.join` will resolve the `..` segments, producing a path outside `__dirname/files`. The handler then happily streams that file to the client.

**Fix:** Use `path.resolve` to canonicalize the final path (CHANGE 2), then check that it starts with the resolved `filesDir` followed by the platform path separator. If not, respond with `400` and return early before any stream is created.

**Explanation:** `path.join` concatenates segments and normalizes separators but does not enforce that the result stays within a base directory. `path.resolve` turns the result into an absolute path with all `..` and `.` components collapsed, which makes it straightforward to compare against the intended base directory with `startsWith`. The `path.sep` suffix on the base directory in the comparison prevents a filename like `files-secret/data` from passing the check because `files-secret` starts with `files` but does not start with `files/`. This guard must run before the stream is opened; placing it after would still allow the file system access to happen.
