## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Original Exception Cause Swallowed
// ------------------------------------------------------------------------

import java.text.ParseException;

public class OrderImportService {

    public void importOrder(String[] csvRow) {
        try {
            Order order = parseRow(csvRow);
            persist(order);
        } catch (Exception e) {
            // Wrap in our domain exception so callers don't
            // need to handle infrastructure-level exceptions
            // CHANGE 1: pass `e` as the cause so the original stack trace is preserved in the wrapped exception
            throw new ImportException("failed to import order: " + e.getMessage(), e);
        }
    }

    private Order parseRow(String[] row) throws ParseException {
        // parsing logic
        return new Order();
    }

    private void persist(Order order) {
        // JPA persist
    }

    static class Order {}

    static class ImportException extends RuntimeException {
        // CHANGE 2: add a two-argument constructor that accepts a cause so the wrapped exception chain is fully preserved
        ImportException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
```

## Explanation

### Issue 1: Original exception cause dropped on wrap

**Problem:** When `parseRow` throws a `ParseException` or `persist` throws a `DataIntegrityViolationException`, the catch block calls `new ImportException("failed to import order: " + e.getMessage())`. Only the message string travels into the new exception. The original stack trace and cause chain are silently discarded. Sentry and the logs only ever see `ImportException: failed to import order: ...` with no further context about where or why the failure occurred.

**Fix:** Change the `throw` statement at the CHANGE 1 site to pass `e` as the second argument: `throw new ImportException("failed to import order: " + e.getMessage(), e)`. This threads the original exception as the `cause` of the `ImportException`.

**Explanation:** `Throwable` stores a `cause` field that is populated only when you explicitly pass it to the constructor — Java does not infer it. When you construct `new RuntimeException(message)` without a cause, `getCause()` returns `null` and the cause chain is empty. Sentry and `printStackTrace()` both walk the cause chain to display the full error tree; with no cause set, they stop at `ImportException` and show nothing deeper. Passing `e` to `super(message, cause)` links the two exceptions, so any diagnostic tool that follows `getCause()` will reach the original `ParseException` or `DataIntegrityViolationException` with its own stack trace intact. A related pitfall: logging `e.getMessage()` inside the catch block without passing the throwable to the logger has the same effect — the stack trace is absent from the log entry.

---

### Issue 2: ImportException missing cause-accepting constructor

**Problem:** `ImportException` only declares `ImportException(String message)`, delegating to `super(message)`. There is no constructor that accepts a `Throwable` cause. Even after fixing the call site, the code would not compile without this constructor because `RuntimeException` does not have a single-argument `String` constructor that magically wires up a cause.

**Fix:** Add the constructor `ImportException(String message, Throwable cause) { super(message, cause); }` at the CHANGE 2 site inside the `ImportException` class.

**Explanation:** `RuntimeException` inherits four constructors from `Throwable`, but none of them are generated automatically in a subclass — you must explicitly declare the ones you want. Without a `(String, Throwable)` constructor, any call site that tries to pass a cause will produce a compile error. Adding the two-argument constructor delegates directly to `RuntimeException(String, Throwable)`, which in turn calls `Throwable(String, Throwable)` and sets both the detail message and the cause field atomically. A common related mistake is declaring only the cause-only constructor `(Throwable cause)` and omitting the combined `(String, Throwable)` form — that loses the custom message instead of the cause, which is equally unhelpful for diagnostics.
