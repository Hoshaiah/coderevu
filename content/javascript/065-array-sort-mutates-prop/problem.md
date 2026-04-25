---
slug: array-sort-mutates-prop
track: javascript
orderIndex: 65
title: Sort Mutates Prop Array In Place
difficulty: easy
tags:
  - state
  - react
  - mutation
language: typescript
---

## Context

The file `src/components/LeaderboardTable.tsx` renders a sorted score table. The component receives an array of player scores as a prop from a parent that holds them in `useState`. The table is supposed to always display scores in descending order, while the parent's original order is preserved for other parts of the UI.

Users notice that after the leaderboard mounts, other parts of the page that depend on the original score ordering (such as a "recently added" sidebar) start showing scores in the wrong order. Refreshing fixes it temporarily, but the problem reappears every time the leaderboard renders.

The team has confirmed the parent is not re-sorting before passing the prop down; the parent state array is somehow being mutated even though the parent never calls `.sort()` itself.

## Buggy code

```typescript
import React from "react";

interface Score {
  playerId: string;
  playerName: string;
  points: number;
}

interface Props {
  scores: Score[];
}

export function LeaderboardTable({ scores }: Props) {
  // Sort descending by points before rendering
  const sorted = scores.sort((a, b) => b.points - a.points);

  return (
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Player</th>
          <th>Points</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((score, index) => (
          <tr key={score.playerId}>
            <td>{index + 1}</td>
            <td>{score.playerName}</td>
            <td>{score.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```
