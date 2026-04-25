---
slug: promise-constructor-sync-throw
track: javascript
orderIndex: 2
title: Thrown Error Escapes Promise Chain
difficulty: easy
tags:
  - async
  - promises
  - error-handling
language: javascript
---

## Context

This utility lives in `src/lib/storage.js` and wraps a legacy callback-based file-parsing library in a Promise so the rest of the codebase can use `async/await`. The library is third-party and cannot be replaced.

In production, when `parseConfig` is given a malformed JSON file, the Node.js process prints an unhandled exception stack trace and, in some environments, crashes the worker. Callers that have `try/catch` around `await parseConfig(path)` report that their catch block is never entered.

The team confirmed the crash is not coming from the callback itself — adding logging shows the synchronous `JSON.parse` call inside the Promise constructor is the one throwing. They assumed any throw inside a `new Promise(...)` executor would automatically become a rejection, which is only partially true.

## Buggy code

```javascript
const fs = require('fs');
const legacyParser = require('legacy-config-parser');

function parseConfig(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const schema = JSON.parse(raw); // throws on malformed JSON

  return new Promise((resolve, reject) => {
    legacyParser.parse(schema, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

module.exports = { parseConfig };
```
