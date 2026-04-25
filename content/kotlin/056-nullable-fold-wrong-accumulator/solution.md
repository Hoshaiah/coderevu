## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Nullable Fold Loses Values Silently
// ------------------------------------------------------------------------

class ReportAggregator {

    fun totalAmount(amounts: List<Double?>): Double {
        // CHANGE 1: Use 0.0 as the initial accumulator instead of null so that a null first element does not cause the entire running total to collapse to 0.0 via the trailing ?: operator.
        return amounts.fold(0.0) { acc: Double, amount ->
            // CHANGE 2: With a non-null Double accumulator the when branches are simplified — only check amount for null; acc is always a valid number, eliminating the conflation of 'no data' and 'missing value'.
            when {
                amount == null -> acc
                else -> acc + amount
            }
        }
    }

    fun generateDailySummary(transactions: List<Double?>): String {
        val total = totalAmount(transactions)
        return "Daily total: $total"
    }
}
```

## Explanation

### Issue 1: Null Initial Accumulator Discards Sums

**Problem:** When `amounts.first()` is `null`, the fold starts with `acc = null`, the `acc == null && amount == null` branch fires and returns `null` again, and from that point on every subsequent non-null value is added to `null` — but because the accumulator stays `null`, the trailing `?: 0.0` turns the whole result into `0.0`. Auditors see a daily total of `0.0` instead of the correct sum.

**Fix:** Replace the `fold(null)` initial value with `fold(0.0)` and change the lambda's accumulator type from `Double?` to `Double`. The `?: 0.0` at the end is no longer needed and is removed.

**Explanation:** `fold` seeds the accumulator with its first argument and threads it through every element. When the seed is `null` and the first element is also `null`, every `when` branch that checks `acc == null` keeps returning `null`. Later elements do hit `else -> acc + amount`, but because `acc` is still `null` at that point Kotlin's `+` on a nullable double doesn't compile — wait, it does compile here because the `else` branch only executes when `acc != null`. The real problem is that `acc` never becomes non-null once it starts as `null` and the first element is `null`, so the running total is forever `null` and the `?: 0.0` swallows it. Starting with `0.0` means the accumulator is always a real number; a `null` amount just returns `acc` unchanged, and a non-null amount adds to the running total correctly.

---

### Issue 2: Null Conflates Identity Value With Missing Data

**Problem:** Using `null` as both the fold identity ("nothing accumulated yet") and the sentinel for missing transaction data makes the two states indistinguishable inside the lambda. This forces four `when` branches to handle all combinations of `acc`/`amount` nullability, and any logic mistake in those branches silently produces wrong totals rather than a compile error.

**Fix:** Change the accumulator to a non-nullable `Double` initialized to `0.0`. The lambda signature becomes `{ acc: Double, amount -> ... }`, and the `when` expression collapses to two branches: return `acc` when `amount` is `null`, otherwise return `acc + amount`.

**Explanation:** When the accumulator type is `Double?`, the compiler cannot warn you that returning `null` from the lambda throws away all future additions, because `null` is a perfectly legal `Double?`. Changing the type to `Double` makes it a compile-time error to return `null` from the lambda, so the entire class of bug becomes impossible. The zero-identity for addition (`0.0`) is the correct seed: an empty list correctly returns `0.0`, a list of all nulls correctly returns `0.0`, and a mixed list correctly sums only the non-null entries.
