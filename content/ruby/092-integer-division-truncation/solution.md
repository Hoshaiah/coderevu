## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Percentage calculation always returns zero for small numerators
# ------------------------------------------------------------------------
class ExperimentReport
  def self.conversion_rate(conversions, impressions)
    return 0 if impressions.zero?

    # CHANGE 1: Convert impressions to a Float before dividing so Ruby performs floating-point division instead of integer division, which truncates toward zero.
    rate = (conversions / impressions.to_f) * 100
    rate.round(2)
  end
end

puts ExperimentReport.conversion_rate(3, 200)   # => 1.5
puts ExperimentReport.conversion_rate(150, 200) # => 75.0
```

## Explanation

### Issue 1: Integer division discards fractional quotient

**Problem:** When both `conversions` and `impressions` are Ruby `Integer` values, the `/` operator performs integer division and discards any remainder. `3 / 200` evaluates to `0`, not `0.015`, so the final result is `0.0` regardless of how many actual conversions exist. This affects every experiment where conversions are fewer than impressions — which is almost every real A/B test.

**Fix:** Replace `impressions` with `impressions.to_f` at the division site (the `# CHANGE 1` line). This coerces the denominator to a `Float`, which causes Ruby to promote the entire division to floating-point arithmetic, preserving the fractional part.

**Explanation:** Ruby's `Integer#/` method performs Euclidean (floor) division: it returns only the whole-number quotient and throws away the remainder. `3 / 200` is `0` because 200 goes into 3 zero whole times. Multiplying that zero by 100 still gives zero. When at least one operand is a `Float`, Ruby uses `Float#/` instead, which returns a `Float` with full precision. Calling `.to_f` on the denominator is the minimal change needed — `3 / 200.0` returns `0.015`, and `0.015 * 100` gives `1.5`, which `.round(2)` leaves as `1.5`. A related pitfall: if you cast with `conversions.to_f` instead, the result is the same here, but consistently converting the denominator is the safer habit because the denominator is what controls truncation when the numerator is smaller.

---

### Issue 2: Multiplication after truncated division scales a wrong integer baseline

**Problem:** Even for cases where `conversions > impressions` is false but `conversions / impressions` rounds to at least 1 (e.g., `150 / 200 = 0` in integer math), the multiply-by-100 step operates on an already-wrong integer. The symptom here is `150 / 200` returning `0`, then `0 * 100 = 0`, so a 75% conversion rate displays as `0.0`. The same root cause (integer division) produces this specific wrong output, and it would affect any rate below 100%.

**Fix:** The same `impressions.to_f` change at `# CHANGE 1` resolves this case as well. `150 / 200.0` evaluates to `0.75`, then `0.75 * 100` gives `75.0`, and `.round(2)` returns `75.0` as expected.

**Explanation:** Because Ruby's `*` operator is applied after `/`, the order of operations means truncation happens first and is permanent — multiplying by 100 afterward cannot recover any fractional information that was discarded. The fix ensures the division result is `0.75` (a `Float`) before multiplication occurs, so `* 100` scales correctly to `75.0`. A useful mental model: always convert to `Float` before any division in a percentage formula, not after, because you cannot un-truncate an integer result.
