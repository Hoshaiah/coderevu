---
slug: negative-array-index-at
track: javascript
orderIndex: 31
title: Array at() vs Bracket Negative Index
difficulty: easy
tags:
  - types
  - correctness
  - api-misuse
language: javascript
---

## Context

This utility is in `lib/playlist.js` and powers a music streaming app's "Up Next" sidebar. The function is supposed to return the last track in the current queue so the UI can show a preview. It is called dozens of times per second as tracks are shuffled and the queue updates.

The sidebar intermittently shows `undefined` instead of a track title, and users report the "Up Next" panel going blank for a beat whenever the queue changes. Sentry captures TypeError exceptions downstream when code tries to read `.title` off the return value. The issue is not consistent — the panel works fine when the queue has exactly one item.

A previous developer added a guard for empty arrays (`queue.length === 0`) thinking that was the edge case, but the blanking still occurs with non-empty queues.

## Buggy code

```javascript
/**
 * Returns the last track in the playback queue.
 * @param {Array<{id: string, title: string, artist: string}>} queue
 */
function getLastTrack(queue) {
  if (queue.length === 0) {
    return null;
  }
  // Use negative index to grab the last element
  return queue[-1];
}

module.exports = { getLastTrack };
```
