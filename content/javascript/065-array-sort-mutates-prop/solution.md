## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Sort Mutates Prop Array In Place
// ------------------------------------------------------------------------

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
  // CHANGE 1: Spread into a new array before sorting so the prop reference is never mutated in place.
  const sorted = [...scores].sort((a, b) => b.points - a.points);

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

## Explanation

### Issue 1: `Array.sort` Mutates Prop In Place

**Problem:** After `LeaderboardTable` mounts, the "recently added" sidebar shows scores in descending order instead of insertion order. The parent never calls `.sort()` itself, yet its state array ends up sorted.

**Fix:** Replace `scores.sort(...)` with `[...scores].sort(...)` at the `CHANGE 1` site. The spread operator creates a fresh shallow copy of the array before `.sort()` runs, leaving the original reference untouched.

**Explanation:** `Array.prototype.sort` sorts the array it is called on and returns *the same array reference* — it does not produce a new array. When the component receives `scores` as a prop, `scores` is a direct reference to the array held in the parent's `useState`. Calling `.sort()` on it physically reorders the elements inside that same memory location, which is why the parent's state reflects the new order even though the parent never called a setter. Every subsequent render re-mutates the already-sorted array (a no-op in practice once it's sorted, but the mutation on first render is enough to break the sidebar). Spreading into a new array (`[...scores]`) copies the element references into a fresh array object, so `.sort()` reorders that copy and the parent's original array is never touched. A related pitfall: `Array.prototype.reverse` has the same in-place behavior and would cause the identical bug.

---
