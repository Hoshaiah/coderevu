---
slug: event-emitter-error-no-listener
track: javascript
orderIndex: 11
title: Unhandled Error Event Crashes Process
difficulty: medium
tags:
  - async
  - error-handling
  - node
language: javascript
---

## Context

This background worker lives in `workers/fileProcessor.js`. It watches an S3-backed queue, downloads files, and pipes them through a transform stream before uploading the result. The pipeline uses Node's `stream.pipeline` for proper cleanup.

In production, the worker process crashes several times per week with the message `Error: ECONNRESET` or `Error: read ETIMEDOUT`, and the entire queue stops processing until ops restarts it. The crash always happens during heavy load when the network is flaky.

The team added `try/catch` around the `pipeline` call and assumed that was sufficient. Error logs show the try/catch is sometimes reached but the process still crashes with an uncaught exception originating from the download stream object itself.

## Buggy code

```javascript
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
  try {
    await pipelineAsync(downloadStream, transform, uploadStream);
  } catch (err) {
    console.error('Pipeline failed:', err.message);
  }
}

module.exports = { processFile };
```
