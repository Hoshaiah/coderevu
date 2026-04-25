---
slug: numeric-sort-default-comparator
track: javascript
orderIndex: 26
title: "Default Sort Comparator on Numbers"
difficulty: easy
tags: ["types", "correctness", "javascript"]
language: javascript
---

## Context

This utility lives in `src/utils/leaderboard.js`. It takes an array of player score objects returned by the scores API and returns the top-N players sorted by score descending. The function is used on both the main leaderboard page and the weekly digest email.

Users with high scores (in the thousands) occasionally appear lower on the leaderboard than players with scores in the hundreds. The bug is intermittent because it depends on which specific score values are present — sometimes the order looks correct by chance.

The developer has verified the raw data from the API is correct. They also confirmed the function returns an array of the right length. A unit test with scores `[10, 9, 8]` passes, which is why the bug wasn't caught before release.

## Buggy code

```javascript
function getTopPlayers(players, n) {
  return players
    .slice()                          // don't mutate the original
    .sort((a, b) => b.score - a.score)  // sort descending by score... or so we think
    .slice(0, n)
    .map((p) => ({
      username: p.username,
      score: p.score,
      rank: null,  // filled in below
    }))
    .map((p, index) => ({ ...p, rank: index + 1 }));
}

function getTopPlayersLegacy(players, n) {
  const sorted = players.slice();
  sorted.sort();   // BUG: sort player objects with default comparator
  sorted.reverse();
  return sorted.slice(0, n);
}
```
