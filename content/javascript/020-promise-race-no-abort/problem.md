---
slug: promise-race-no-abort
track: javascript
orderIndex: 20
title: Promise.race Without Cancelling Loser
difficulty: hard
tags:
  - async
  - memory
  - resource-management
language: typescript
---

## Context

The module `src/services/dataFetcher.ts` implements a "fastest source wins" pattern: it fires the same data request at both a primary API and a cache replica simultaneously, resolves with whichever responds first, and falls back gracefully. This runs inside a Next.js API route handler that processes hundreds of requests per second.

Over time, memory usage grows steadily and the process has to be restarted every few hours. Heap snapshots show an accumulating number of `Response` objects and `ReadableStream` instances that are never garbage-collected. APM traces show two outbound HTTP requests per call, both of which complete, but only one result is ever used.

The team added connection pooling and reduced request timeouts, which slowed but did not stop the leak.

## Buggy code

```typescript
import fetch from "node-fetch";

const PRIMARY_URL = "https://api.example.com/data";
const REPLICA_URL = "https://replica.example.com/data";

export async function fetchFastest(path: string): Promise<unknown> {
  const primary = fetch(`${PRIMARY_URL}${path}`).then((r) => r.json());
  const replica = fetch(`${REPLICA_URL}${path}`).then((r) => r.json());

  return Promise.race([primary, replica]);
}
```
