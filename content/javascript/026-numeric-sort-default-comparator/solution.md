## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Default Sort Comparator on Numbers
// ------------------------------------------------------------------------

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
  // CHANGE 1: provide an explicit numeric comparator so sort orders by score instead of coercing objects to '[object Object]'
  sorted.sort((a, b) => b.score - a.score);
  // CHANGE 1: removed sorted.reverse() — the comparator above already produces descending order, reversing would flip it back to ascending
  return sorted
    .slice(0, n)
    // CHANGE 2: map results to include a 1-based rank property, matching the shape getTopPlayers returns
    .map((p, index) => ({
      username: p.username,
      score: p.score,
      rank: index + 1,
    }));
}
```

## Explanation

### Issue 1: Default Comparator on Objects

**Problem:** Players with scores in the thousands intermittently appear below players with scores in the hundreds on the leaderboard. The order looks correct sometimes because the input data happens to already be partially sorted, masking the bug. A simple test with `[10, 9, 8]` passes only because those small integers, when stringified, still sort in the "right" order by accident.

**Fix:** Replace the bare `sorted.sort()` call with `sorted.sort((a, b) => b.score - a.score)` and remove the subsequent `sorted.reverse()` call, so the array is sorted descending by `score` in one step.

**Explanation:** When `Array.prototype.sort` receives no comparator, it converts each element to a string before comparing. For plain objects, that string is always `'[object Object]'`, so every element compares as equal and the engine is free to leave them in any order — in practice the order depends on the JS engine's internal sort implementation and the existing arrangement of the array. The fix supplies a subtraction comparator `(a, b) => b.score - a.score`: a positive result means `b` comes first, negative means `a` comes first, zero means equal, which is exactly what `sort` needs to order by score descending. The `reverse()` call is also removed because it would negate the descending order the comparator already establishes. Note that the subtraction comparator is safe here because scores are finite integers; if scores could be `NaN` or `Infinity` a more defensive comparison would be needed.

---

### Issue 2: Missing rank Property on Returned Objects

**Problem:** Callers that consume the result of `getTopPlayersLegacy` and read `player.rank` always get `undefined`, because the function returns raw player objects straight from the API without attaching a rank. UI components that display "#1", "#2", etc. show nothing or crash depending on how they handle `undefined`.

**Fix:** Chain a `.map((p, index) => ({ username: p.username, score: p.score, rank: index + 1 }))` onto the `slice(0, n)` result, mirroring exactly what `getTopPlayers` does in its final `.map` call.

**Explanation:** The rank of a player is a derived value — it is their position in the already-sorted, already-sliced top-N list, not something the API provides. `getTopPlayers` computes it with a second `map` that uses the array index after slicing. `getTopPlayersLegacy` never did that step, so consumers got the raw API shape. The fix maps over the sliced array and sets `rank` to `index + 1` (converting the 0-based array index to a 1-based display rank). Because the slice happens before the map, rank 1 always corresponds to the highest score in the returned set, which is the correct behavior.
