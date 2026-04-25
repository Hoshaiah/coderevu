## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Null Input to String Switch NPE
// ------------------------------------------------------------------------

public class InvoiceRouter {

    public Processor route(Invoice invoice) {
        // CHANGE 1: Guard against null type before entering the switch; Java switch-on-String throws NPE when the expression is null because it calls String.equals() internally.
        if (invoice.getType() == null) {
            throw new IllegalArgumentException(
                "Invoice type is null; the upstream API omitted the 'type' field for invoice id: " + invoice.getId());
        }
        switch (invoice.getType()) {
            case "STANDARD":
                return new StandardProcessor();
            case "CREDIT":
                return new CreditProcessor();
            case "RECURRING":
                return new RecurringProcessor();
            // CHANGE 2: Default message is unchanged in logic, but null case is now handled above so this branch only fires for genuinely unknown non-null type values.
            default:
                throw new IllegalArgumentException(
                    "Unknown invoice type: '" + invoice.getType() + "'");
        }
    }
}
```

## Explanation

### Issue 1: Null String Causes Switch NPE

**Problem:** When `invoice.getType()` returns `null`, the `switch` statement throws a `NullPointerException`. The service catches nothing here, so the invoice is silently dropped and no retry is triggered. The stack trace points into `route()` but no application log explains why.

**Fix:** A null check on `invoice.getType()` is added immediately before the `switch`. If the type is `null`, the method throws an `IllegalArgumentException` with a descriptive message that includes the invoice ID, so the caller can log it and apply retry or dead-letter logic.

**Explanation:** Java's `switch` on a `String` works by calling `String.equals()` on the switch expression against each case label. If the expression itself is `null`, that `equals()` call is made on a null reference, which the JVM converts into a `NullPointerException`. This is not a programmer mistake in `equals()`; it is a documented language behavior for `switch` statements prior to pattern-matching features in newer Java versions. Adding the explicit null check before the `switch` means the null path is handled deliberately and produces an actionable error instead of an opaque NPE. A related pitfall: if the team later caches `invoice.getType()` into a local variable and checks that variable for null, they should make sure the same variable is used in the `switch` — calling `getType()` twice with a mutable object could theoretically return different values.

---

### Issue 2: Null Type Produces Misleading Diagnostic in Default Branch

**Problem:** Before the fix, if a `null` somehow reached the `default` branch (say, if the language behavior changed or the code was refactored), the error message would read `Unknown invoice type: null`, which looks identical to a legitimate unknown type and gives the on-call engineer no signal that the root cause is a missing field rather than a bad field value.

**Fix:** The null case is now routed to its own explicit `IllegalArgumentException` before the `switch`, with a message that names the problem as a missing `type` field and includes the invoice ID. The `default` branch is left to handle only genuinely unknown non-null type strings.

**Explanation:** Separating the null case from the unknown-value case matters for observability. When alerts fire on `IllegalArgumentException` messages, an operator scanning logs can immediately distinguish "the upstream partner sent no type field" from "the upstream partner sent a type we don't recognize". Both are actionable, but the remediation differs: the first requires a conversation with the partner about their API contract, while the second might mean a new processor needs to be added. Mixing them under one vague message delays diagnosis. Including the invoice ID in the null-case message also makes it straightforward to correlate the log entry with the specific request in distributed tracing.
