## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Deque Used as Stack Pops Wrong End
// ------------------------------------------------------------------------

import java.util.ArrayDeque;
import java.util.Deque;

public class ExpressionEvaluator {

    public double evaluate(String[] tokens) {
        Deque<Double> stack = new ArrayDeque<>();

        for (String token : tokens) {
            switch (token) {
                case "+": {
                    // CHANGE 1: use removeLast() so we pop from the same end we push to (the tail), preserving LIFO order.
                    double b = stack.removeLast();
                    // CHANGE 1: same fix — removeLast() for the second operand so 'a' is the earlier-pushed value.
                    double a = stack.removeLast();
                    stack.addLast(a + b);
                    break;
                }
                case "*": {
                    // CHANGE 1: use removeLast() instead of removeFirst() to treat the deque as a stack (LIFO).
                    double b = stack.removeLast();
                    // CHANGE 1: same fix for the second pop in the multiply case.
                    double a = stack.removeLast();
                    stack.addLast(a * b);
                    break;
                }
                default:
                    stack.addLast(Double.parseDouble(token));
            }
        }
        // CHANGE 2: use removeLast() to retrieve the final result from the tail where all values were pushed.
        return stack.removeLast();
    }
}
```

## Explanation

### Issue 1: `removeFirst` pops queue end, not stack end

**Problem:** Every operator call uses `removeFirst()` to pop operands, but operands are pushed with `addLast()`. This means operands are consumed in the order they were pushed (oldest first), the opposite of stack semantics. For `3 4 5 + *`, the `+` pops `3` and `4` instead of `4` and `5`, so the intermediate result is `7` instead of `9`, and the final multiply is then wrong.

**Fix:** Replace every `stack.removeFirst()` call with `stack.removeLast()` in all operator cases (both `+` and `*`). `addLast` and `removeLast` now target the same end of the deque, giving correct LIFO behaviour.

**Explanation:** `ArrayDeque` is a double-ended queue. When you call `addLast`, the new element goes to the tail. `removeFirst` takes from the head — the element that has been there the longest. That is queue (FIFO) behaviour. A stack requires LIFO: the last thing pushed must be the first thing popped, which means `removeLast` must match `addLast`. The mismatch is invisible when the stack never holds more than two elements (addition of only two numbers), because `removeFirst` and `removeLast` return the same item when the deque has one element. With three or more elements the mismatch becomes observable and every multi-operand expression returns a wrong value.

---

### Issue 2: Final `removeFirst` reads wrong end for the result

**Problem:** After all tokens are processed the single remaining value is at the tail of the deque (the last place `addLast` wrote to). Calling `removeFirst()` to retrieve it reads the head. When the expression has exactly one token (a single number) this still works by accident, but for any expression where the accumulation causes the result to sit at the tail alongside an empty head it would return the wrong value or throw.

**Fix:** Replace `stack.removeFirst()` with `stack.removeLast()` in the final return statement so the result is fetched from the same end all values are pushed to.

**Explanation:** All pushes go through `addLast`, so the canonical top-of-stack is always the tail. Consistency requires that every read also targets the tail via `removeLast`. The original code used `removeFirst` uniformly, which happened to work for single-token inputs (deque of size 1 has only one element) but is incorrect in general. Fixing all pop sites — both inside operator cases and the final return — ensures the deque behaves as a proper stack throughout the entire evaluation.
