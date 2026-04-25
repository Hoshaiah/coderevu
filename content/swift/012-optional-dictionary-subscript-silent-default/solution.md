## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Optional Dictionary Subscript Wrong Default
// ------------------------------------------------------------------------

class ScoreTracker {
    private var scores: [String: Int] = [:]

    func addBonus(_ bonus: Int, to playerID: String) {
        // CHANGE 1: Replace `?? bonus` with `?? 0` so a new player starts from 0, not from `bonus` (which was doubling the first bonus).
        scores[playerID] = (scores[playerID] ?? 0) + bonus
    }

    func score(for playerID: String) -> Int {
        return scores[playerID] ?? 0
    }

    func topPlayer() -> String? {
        return scores.max(by: { $0.value < $1.value })?.key
    }
}
```

## Explanation

### Issue 1: Wrong nil-coalescing default doubles first bonus

**Problem:** When `addBonus` is called for a player who has no entry in `scores` yet, `scores[playerID]` is `nil`. The expression `(scores[playerID] ?? bonus) + bonus` evaluates to `bonus + bonus`, so the player's score is set to twice the intended bonus. On every subsequent call the player already has a value, so `??` never fires and accumulation works correctly — meaning the bug only affects the very first bonus a new player receives.

**Fix:** Replace `?? bonus` with `?? 0` on the nil-coalescing line inside `addBonus`, so the expression becomes `(scores[playerID] ?? 0) + bonus`. This is the only token that changes.

**Explanation:** The nil-coalescing operator `??` returns its right-hand operand when the left side is `nil`. The original code passed `bonus` as that fallback, intending it as a shorthand for "if there's no score, the result should just be `bonus`". But the `+ bonus` at the end of the expression is unconditional — it runs whether or not `??` fired. So when `scores[playerID]` is `nil`, the result is `bonus` (from `??`) plus `bonus` (from the addition) = `2 * bonus`. Changing the fallback to `0` means a missing entry is treated as a zero score, and only the single `+ bonus` increment is applied. A related pitfall: using the incoming parameter as a default anywhere in an arithmetic expression is risky because the parameter also appears elsewhere in the same expression — it is easy to accidentally count it twice, exactly as happened here.
