---
slug: unhandled-stream-error
track: javascript
orderIndex: 91
title: >-
  File download handler crashes the Node process when the source stream emits an
  error
difficulty: medium
tags:
  - error-handling
  - streams
  - resource-management
language: javascript
---

## Context

This Express handler streams a file from the local filesystem directly to the HTTP response. It is used for a large-file download endpoint where buffering the entire file in memory is unacceptable.

Ops reports that roughly once a day the Node process dies with an `ENOENT` or `EACCES` unhandled error during a download, bringing down the whole server.

## Buggy code

```javascript
const fs = require("fs");
const path = require("path");

app.get("/downloads/:filename", (req, res) => {
  const filePath = path.join(__dirname, "files", req.params.filename);

  res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
  res.setHeader("Content-Type", "application/octet-stream");

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
});
```
