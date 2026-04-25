## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Format String Argument Count Mismatch
// ------------------------------------------------------------------------

import java.util.logging.Logger;

public class AuditLogger {

    private static final Logger log = Logger.getLogger(AuditLogger.class.getName());

    // Format: [txId] userId amount currency
    private static final String AUDIT_FMT = "[%s] user=%s amount=%s currency=%s";

    public void recordPayment(String txId, String userId,
                              String amount, String currency) {
        String line = buildAuditLine(txId, userId, amount, currency);
        log.info(line);
    }

    private String buildAuditLine(String txId, String userId,
                                  String amount, String currency) {
        // CHANGE 1: Added the missing `currency` argument so all four %s placeholders in AUDIT_FMT are satisfied and no MissingFormatArgumentException is thrown.
        return String.format(AUDIT_FMT, txId, userId, amount, currency);
    }
}
```

## Explanation

### Issue 1: Missing Fourth Format Argument

**Problem:** Every call to `buildAuditLine` throws `java.util.util.MissingFormatArgumentException` at runtime. The format string `AUDIT_FMT` contains four `%s` placeholders, but only three values — `txId`, `userId`, and `amount` — are passed to `String.format`. The `currency` placeholder is left unsatisfied, so `String.format` throws before it can return a string, and no audit line is ever written.

**Fix:** Add `currency` as the fourth argument to `String.format` in `buildAuditLine`, changing `String.format(AUDIT_FMT, txId, userId, amount)` to `String.format(AUDIT_FMT, txId, userId, amount, currency)`.

**Explanation:** `String.format` counts the placeholders in the format string left-to-right and pairs each one with a positional argument from the varargs list. When the argument list is shorter than the placeholder count, `String.format` throws `MissingFormatArgumentException` immediately — it does not substitute an empty string or null. In this code, `currency` was already accepted as a parameter to `buildAuditLine` but was accidentally omitted when the `String.format` call was written, leaving the fourth `%s` with nothing to consume. Passing `currency` as the fourth argument gives `String.format` exactly the values it needs and lets the method return the complete log line. A related pitfall: if you later add a fifth field to `AUDIT_FMT` but forget to add the corresponding argument, the same silent failure recurs — consider a unit test that asserts the returned string contains all expected substrings.
