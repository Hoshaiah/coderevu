## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — ExecutionException Cause Never Unwrapped
// ------------------------------------------------------------------------

import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.*;

public class ReportExporter {
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    public void exportAll(List<String> regions) throws ReportGenerationException {
        List<Future<Void>> futures = new ArrayList<>();
        List<String> regionOrder = new ArrayList<>(regions);
        for (String region : regions) {
            futures.add(pool.submit(() -> {
                generateReport(region);
                return null;
            }));
        }
        for (int i = 0; i < futures.size(); i++) {
            Future<Void> f = futures.get(i);
            // CHANGE 4: track the region name alongside its Future so we can name it in error messages
            String region = regionOrder.get(i);
            try {
                f.get();
            } catch (InterruptedException e) {
                // CHANGE 2: restore interrupted status before rethrowing so callers can observe cancellation
                Thread.currentThread().interrupt();
                throw new RuntimeException("Interrupted while waiting for report task for region: " + region, e);
            } catch (ExecutionException e) {
                // CHANGE 1: unwrap the ExecutionException to retrieve the actual worker exception
                Throwable cause = e.getCause();
                if (cause instanceof ReportGenerationException) {
                    // CHANGE 3+4: rethrow the original typed exception directly (preserving its message and stack), with region context prepended
                    throw new ReportGenerationException("Region '" + region + "': " + cause.getMessage(), cause);
                }
                // CHANGE 3: chain the unwrapped cause so root-cause information is never lost
                throw new RuntimeException("Unexpected error generating report for region: " + region, cause);
            }
        }
    }

    private void generateReport(String region) throws ReportGenerationException {
        // ... report logic ...
    }
}
```

## Explanation

### Issue 1: `ExecutionException` cause never unwrapped

**Problem:** When a worker thread throws `ReportGenerationException`, the `Future.get()` call wraps it inside an `ExecutionException`. The original catch block ignores `e` entirely and constructs a brand-new `RuntimeException("Task failed")` with no cause. The real exception — including its message, type, and stack trace — is completely gone from everything that follows.

**Fix:** Call `e.getCause()` on the caught `ExecutionException` to retrieve the original worker exception. Then check whether it is a `ReportGenerationException` with `instanceof` and either rethrow it directly or pass it as the `cause` argument to the new `RuntimeException`.

**Explanation:** `ExecutorService.submit()` captures any `Throwable` thrown inside a `Callable` and stores it inside an `ExecutionException`. The only way to get it back is to call `getCause()`. Without that call the worker exception is reachable only via the `ExecutionException` object `e`, which the original code ignores. Once a new `RuntimeException("Task failed")` is constructed from scratch, the JVM has no record of the original exception. Log frameworks and monitoring tools only see the new exception's message and stack, which start at the `catch` block, not inside the worker. Unwrapping with `getCause()` recovers the full original stack trace and lets callers handle typed exceptions such as `ReportGenerationException`.

---

### Issue 2: `InterruptedException` swallowed without restoring interrupted status

**Problem:** `InterruptedException` is caught and then discarded together with `ExecutionException` in the same `catch` clause. The thread's interrupted flag is cleared by the act of catching `InterruptedException`, and the code never sets it back. Any caller or framework that checks `Thread.currentThread().isInterrupted()` to detect cancellation will see `false` and believe everything is normal.

**Fix:** Split the catch into two separate blocks. In the `InterruptedException` branch, call `Thread.currentThread().interrupt()` before rethrowing, which restores the interrupted status flag that Java automatically cleared when the exception was thrown.

**Explanation:** Java's interruption model is cooperative: a thread signals intent to stop by setting the interrupted flag, and code running in that thread checks the flag (or catches `InterruptedException`) and cleans up. When `InterruptedException` is thrown the flag is cleared so the exception is not raised twice, but it is the catcher's responsibility to restore it if the exception is not propagated directly. Swallowing it without restoration silently breaks cancellation for thread pools, `Future.cancel()`, and shutdown hooks. Calling `Thread.currentThread().interrupt()` restores the flag so any upstream code — including the `ExecutorService` itself — can observe that the thread was interrupted.

---

### Issue 3: New exception constructed without chaining original cause

**Problem:** Even if a developer notices the `ExecutionException` and tries to fix the unwrapping partially, the fallback path `throw new RuntimeException("Task failed")` passes no second argument. Java's exception chaining mechanism (`initCause` / the two-argument constructor) is never used, so the `getCause()` chain stops at the new `RuntimeException`. Log lines and monitoring alerts show only `"Task failed"` with no `Caused by:` block.

**Fix:** Pass the unwrapped `cause` as the second argument to the `RuntimeException` constructor: `new RuntimeException("...", cause)`. For the typed case, pass `cause` to the `ReportGenerationException` constructor so its own cause chain is also preserved.

**Explanation:** Java's `Throwable` stores a single `cause` reference. When you print or log a `Throwable`, the standard `printStackTrace()` and most logging frameworks follow that chain and print each `Caused by:` entry. If the cause is `null`, the chain ends. Constructing `new RuntimeException("Task failed")` sets cause to `null` explicitly (it is the no-cause constructor overload). Passing the real exception as the second argument sets the cause reference, which log frameworks then print as a `Caused by:` block, making the root cause immediately visible.

---

### Issue 4: Region name absent from rethrown exception

**Problem:** All regions are processed in a loop and their futures are collected in a list, but when a future fails the code throws `new RuntimeException("Task failed")` with no mention of which region caused it. With four or more regions running in parallel, on-call engineers cannot tell from the log which region to investigate.

**Fix:** Iterate using an index instead of an enhanced for-loop, look up the corresponding region name via `regionOrder.get(i)`, and include that name in every exception message: for example `"Region 'us-east-1': " + cause.getMessage()`.

**Explanation:** The futures list and the regions list are constructed in the same order, so index `i` in `futures` always corresponds to index `i` in `regions`. Using an index-based loop makes the mapping explicit without needing a separate map structure. Including the region string in both the `InterruptedException` and `ExecutionException` error messages means that every failure path surfaces enough context for an on-call engineer to identify the affected region immediately without adding extra log statements inside the worker `Callable`.
