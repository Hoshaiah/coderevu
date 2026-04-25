## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Summing large order values silently overflows and returns a wrong total
// ------------------------------------------------------------------------
import java.util.List;

public class InvoiceCalculator {

    public long grandTotal(List<Long> lineTotals) {
        // CHANGE 1: declared as `long` instead of `int` to hold the full 64-bit range
        long sum = 0;
        for (long amount : lineTotals) {
            // CHANGE 2: compound assignment now operates on two `long` operands, so no truncation occurs mid-loop
            sum += amount;
        }
        return sum;
    }
}
```

## Explanation

### Issue 1: Accumulator type too narrow

**Problem:** The running total is stored in an `int`, which can hold at most 2,147,483,647. When the sum of line totals exceeds that value, the `int` wraps around silently — there is no exception — and the returned grand total is a large negative or otherwise wrong number. Automated payment checks see a negative invoice total and reject the order.

**Fix:** Replace `int sum = 0` with `long sum = 0`. This is the CHANGE 1 site. The accumulator now has the same 64-bit capacity as the input values.

**Explanation:** Java's `int` type is 32 bits and uses two's-complement representation. Once it exceeds 2^31 − 1, the bit pattern wraps to a large negative value. The `long` values coming from the JDBC layer each fit fine on their own, but the moment they are added into an `int` accumulator via `sum += amount`, Java narrows the `long` to 32 bits before storing it. Changing the accumulator to `long` keeps all 64 bits throughout the loop. A related pitfall: if you wrote `long sum = 0 + lineTotals.get(0)`, the literal `0` would still be an `int`, and an integer addition would happen first — always use `0L` or declare the variable as `long` explicitly.

---

### Issue 2: Widening at return is too late

**Problem:** The method signature promises a `long` return value, and the `int sum` is automatically widened to `long` when the `return sum` statement executes. This looks correct at a glance, but by that point the `int` has already overflowed inside the loop, so what gets widened is an already-corrupt value. The caller receives a wrong `long` that happens to fit in 64 bits.

**Fix:** The same `long sum = 0` change at CHANGE 2 makes the `+=` operation a `long + long` addition throughout the loop, so the overflow never happens and there is nothing wrong to widen at the return.

**Explanation:** Java widens `int` to `long` losslessly when types are mixed — but widening preserves the bit pattern, not the mathematical value. If `sum` already holds −2,000,000,000 due to overflow, widening produces the `long` value −2,000,000,000, not the intended large positive total. The fix ensures that every intermediate result in the loop is kept in a 64-bit register, so overflow can only happen if the true mathematical sum exceeds 9.2 × 10^18, which is far beyond any realistic invoice total.
