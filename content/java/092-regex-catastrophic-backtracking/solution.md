## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Regex Pattern Causes Catastrophic Backtracking
// ------------------------------------------------------------------------

import java.util.regex.Pattern;

public class InputValidator {
    // CHANGE 1: Rewritten pattern eliminates nested quantifiers; uses a possessive quantifier and an atomic-group-equivalent structure: one mandatory word, then zero-or-more (space-run followed by word) sequences.  This removes the ambiguity that caused exponential backtracking — the engine can no longer try exponentially many ways to partition the input among the two quantifiers.
    private static final Pattern DESCRIPTION_PATTERN =
        Pattern.compile("^[a-zA-Z0-9]+(?: +[a-zA-Z0-9]+)*$");

    public boolean isValidDescription(String input) {
        if (input == null || input.length() > 500) {
            return false;
        }
        // CHANGE 2: Strip leading/trailing whitespace before matching so that a lone trailing space (common in pasted input) doesn't send the old pattern into a backtracking spiral, and doesn't falsely reject otherwise-valid descriptions.
        String trimmed = input.strip();
        if (trimmed.isEmpty()) {
            return false;
        }
        return DESCRIPTION_PATTERN.matcher(trimmed).matches();
    }
}
```

## Explanation

### Issue 1: Nested Quantifier Causes Exponential Backtracking

**Problem:** The pattern `^([a-zA-Z0-9]+ *)*$` contains a quantifier inside a quantifier. When the engine is given a string like `"aaaa!"` that cannot match, it tries every possible way to split the alphanumeric characters between the outer `*` repetitions and the inner `+`, producing exponential work. In practice a 30-character invalid string can make the thread spin for minutes at 100% CPU.

**Fix:** Replace `^([a-zA-Z0-9]+ *)*$` with `^[a-zA-Z0-9]+(?: +[a-zA-Z0-9]+)*$`. The new pattern uses a non-capturing group `(?:...)` with no nesting of variable-length quantifiers inside another variable-length quantifier.

**Explanation:** Java's `java.util.regex` engine uses an NFA-based backtracking algorithm. When two adjacent quantifiers both expand to cover the same characters — as `+` and `*` do in the original — the engine must explore every partition of the matched characters among repetitions before it can report failure. For `n` alphanumeric characters there are O(2^n) such partitions. The fixed pattern has a unique parse for any given input: one leading word, then alternating spaces and words. There is no ambiguity for the engine to explore, so failure is reported in linear time. A related pitfall: even replacing `*` with `+` inside the group doesn't fully fix it; the structural ambiguity must be removed by making words and separators non-interchangeable in the grammar.

---

### Issue 2: Trailing Whitespace Triggers the Worst-Case Path

**Problem:** A description like `"hello "` (word followed by a space) is rejected by the fixed pattern and also reliably hit the slow path of the original pattern, because the trailing space satisfies the inner ` *` repeatedly while the outer `*` keeps retrying from different positions. Users who paste text from a document often produce this input without realising it.

**Fix:** Call `input.strip()` before passing the string to the matcher, and add an `isEmpty()` guard so a whitespace-only string returns `false` immediately instead of going to the regex at all.

**Explanation:** `String.strip()` (Java 11+) removes leading and trailing Unicode whitespace, normalising the most common accidental-invalid-suffix case. After stripping, `"hello "` becomes `"hello"`, which the pattern accepts without issue. The `isEmpty()` check ensures that a string containing only spaces (which strips to `""`) is rejected fast rather than handed to the regex. If you are on Java 8 you can use `input.trim()` instead; the behaviour is equivalent for the ASCII space character. This change is intentionally minimal — it does not alter how internal spaces are treated, so descriptions with multiple words still work as before.
