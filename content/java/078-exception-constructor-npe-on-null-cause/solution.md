## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Exception Constructor Null Cause NPE
// ------------------------------------------------------------------------

public class PaymentGateway {
    private final ProcessorClient client;
    private final ErrorCodeRegistry registry;

    public PaymentGateway(ProcessorClient client, ErrorCodeRegistry registry) {
        this.client = client;
        this.registry = registry;
    }

    public void charge(String accountId, long amountCents) {
        ProcessorResponse response = client.charge(accountId, amountCents);
        if (!response.isSuccess()) {
            String detail = registry.fetchErrorDetail(response.getErrorCode());
            // detail may be null for unknown error codes
            throw new PaymentException(response.getErrorCode(), detail);
        }
    }
}

class PaymentException extends RuntimeException {
    private final String errorCode;

    public PaymentException(String errorCode, String detail) {
        // CHANGE 1: Use the single-argument super(detail) constructor so that a null detail is stored as a null message without triggering the two-arg RuntimeException(String,Throwable) overload that NPEs when cause processing touches the null value.
        // CHANGE 2: Remove the bogus new RuntimeException(detail) synthetic cause; it served no diagnostic purpose and was the direct source of the NPE when detail is null.
        super(detail);
        this.errorCode = errorCode;
    }

    public String getErrorCode() { return errorCode; }
}
```

## Explanation

### Issue 1: Two-arg constructor NPE on null message

**Problem:** When `registry.fetchErrorDetail` returns `null` for an unknown error code, the `PaymentException` constructor calls `super(null, new RuntimeException(null))`. The `RuntimeException(String message, Throwable cause)` overload internally calls `initCause(cause)` and performs additional processing that dereferences the message in a way that throws a `NullPointerException` before the `PaymentException` is ever fully constructed. In production this surfaces as an untracked NPE inside `java.lang.Exception.<init>` with no pointer into payment logic.

**Fix:** Replace `super(detail, new RuntimeException(detail))` with `super(detail)` at the CHANGE 1 site. The single-argument `RuntimeException(String message)` constructor accepts `null` without complaint and stores it as a null message field.

**Explanation:** The team tested `new RuntimeException(null)` in isolation and found it worked, but that exercises the single-argument constructor. The two-argument constructor `RuntimeException(String, Throwable)` takes a different code path: it calls `Throwable(String message, Throwable cause)` in the JDK, which calls `cause.fillInStackTrace()` and related bookkeeping that ultimately touches the message. When `detail` is `null` that path raises an NPE. The single-argument constructor stores the message directly with no further processing, so `null` is safe. A related pitfall: `new Exception(null, null)` also NPEs because the `cause` argument is dereferenced unconditionally before the null check on message.

---

### Issue 2: Synthetic cause hides real origin

**Problem:** Even when `detail` is non-null, the constructor wraps it in `new RuntimeException(detail)` and passes that as the cause. Any logging or monitoring tool that prints the cause chain shows a meaningless `RuntimeException` with the same message string, making it look like there was a prior exception that triggered the payment failure when there was none.

**Fix:** Remove `new RuntimeException(detail)` entirely at the CHANGE 2 site so the cause is simply absent. The single-argument `super(detail)` call stores only the message, and `getCause()` returns `null`, which is the accurate representation of the situation.

**Explanation:** A Throwable cause is meant to hold the upstream exception that made this one necessary — for example, a caught `IOException` that forced you to throw a domain exception. Here there is no upstream exception; the processor just returned an error code. Storing a freshly constructed `RuntimeException(detail)` as the cause invents a fake event in the causal chain. When an engineer reads a stack trace in a log aggregator and sees `Caused by: java.lang.RuntimeException: DECLINED`, they waste time looking for a thrown exception that never actually occurred. Removing the synthetic cause makes the stack trace honest.
