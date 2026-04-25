## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Null Peek on Empty Deque
// ------------------------------------------------------------------------

import java.util.ArrayDeque;
import java.util.Deque;

public class TokenStream {
    // CHANGE 2: Add a synthetic EOF sentinel returned when the deque is empty, so current() never returns null.
    private static final Token EOF_SENTINEL = new Token(TokenType.EOF, "");

    private final Deque<Token> tokens;

    public TokenStream(Iterable<Token> source) {
        this.tokens = new ArrayDeque<>();
        for (Token t : source) {
            tokens.addLast(t);
        }
    }

    // CHANGE 1: Return EOF_SENTINEL instead of null when the deque is empty, preventing NullPointerException at call sites.
    public Token current() {
        Token peeked = tokens.peek();
        return peeked != null ? peeked : EOF_SENTINEL;
    }

    public Token consume() {
        return tokens.poll();
    }

    public boolean hasMore() {
        return !tokens.isEmpty();
    }
}
```

## Explanation

### Issue 1: `peek()` Returns Null on Empty Deque

**Problem:** When the deque has been fully drained, `ArrayDeque.peek()` returns `null`. Every call site that does `stream.current().type()` then throws a `NullPointerException`. Because the crash is inside a chained method call, the stack trace doesn't point at a helpful line — it just blows up inside the parser logic that trusted `current()` to be non-null.

**Fix:** In `current()`, capture the result of `tokens.peek()` into a local variable and return `EOF_SENTINEL` instead of `null` when it is `null`. The sentinel is a pre-built `Token` with `TokenType.EOF` so callers get a safe, dereferenceable object.

**Explanation:** `ArrayDeque.peek()` is documented to return `null` when the queue is empty — it does not throw. The original code forwarded that `null` directly to callers, which all assumed a non-null return. The fix inserts a null check inside `current()` rather than scattering null checks across every call site. The sentinel value works because the tokenizer always appends a real EOF token, so in the normal path the deque is never empty before EOF is consumed; the sentinel only activates in edge cases where the deque drains unexpectedly. One related pitfall: `consume()` still returns `null` via `poll()` on an empty deque — callers should not dereference its return value unconditionally either.

---

### Issue 2: No Safe Non-Null Sentinel for Exhausted Stream

**Problem:** The class had no shared constant representing "end of input" that `current()` could return safely. Without it, any fix to issue 1 would have to construct a new `Token` object on every call to an empty `current()`, or duplicate the EOF construction logic in multiple places.

**Fix:** A `private static final Token EOF_SENTINEL` field is added at the top of the class, initialized once with `TokenType.EOF` and an empty string. `current()` returns this constant whenever `peek()` yields `null`.

**Explanation:** Making the sentinel `static final` means it is created exactly once at class-load time and reused for every empty-deque call. This avoids repeated object allocation in tight parser loops and gives the sentinel a single definition point, making it easy to update if `Token`'s constructor signature changes. The sentinel's `TokenType.EOF` value is the correct choice because callers already handle EOF to terminate parse loops — they will exit cleanly rather than misinterpreting the exhausted state as some other token type.
