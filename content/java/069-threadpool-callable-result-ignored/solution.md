## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Callable Result Never Checked for Null
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import java.util.logging.Logger;

public class PricingEngine {
    private static final Logger logger = Logger.getLogger(PricingEngine.class.getName());
    private final ExecutorService executor = Executors.newFixedThreadPool(4);

    public double calculateTotal(List<Callable<Double>> pricingTasks) throws InterruptedException {
        List<Future<Double>> futures = new ArrayList<>();
        for (Callable<Double> task : pricingTasks) {
            futures.add(executor.submit(task));
        }

        double total = 0.0;
        for (Future<Double> future : futures) {
            try {
                Double result = future.get(2, TimeUnit.SECONDS);
                // CHANGE 1: guard against a null result before unboxing to avoid NPE on result.doubleValue()
                if (result != null) {
                    total += result.doubleValue();
                }
            } catch (TimeoutException e) {
                // CHANGE 2: cancel the future after timeout so the thread-pool thread is not held by a stalled task
                future.cancel(true);
                logger.warning("Pricing task timed out and was cancelled.");
            } catch (ExecutionException e) {
                // CHANGE 3: log the underlying cause so task failures are visible in production diagnostics
                logger.warning("Pricing task failed: " + e.getCause());
            }
        }
        return total;
    }
}
```

## Explanation

### Issue 1: Null result causes NPE on unbox

**Problem:** When `future.get()` times out, the `TimeoutException` is caught and execution continues past the `catch` block. Because `result` was never assigned a value by `future.get()`, it holds `null`. The very next line calls `result.doubleValue()`, which throws `NullPointerException`. This matches exactly the reported stack trace and the correlation with slow pricing-service responses.

**Fix:** A null check `if (result != null)` is added immediately after `future.get()` returns, before `result.doubleValue()` is called. The `total +=` line only executes when `result` is a real value.

**Explanation:** `future.get(timeout, unit)` can legitimately return `null` if the underlying `Callable` returns `null`, but even more relevant here: when `TimeoutException` is thrown, the local variable `result` is initialized to `null` by Java because it was declared with `Double result = future.get(...)` — the assignment never completes. The `catch (TimeoutException)` block swallows the exception and lets execution fall through to the loop's next statement, but `result` is still `null`. Calling any method on a `null` reference throws `NPE`. Checking `result != null` before unboxing prevents the crash. A related pitfall: if a `Callable` intentionally returns `null`, the same NPE occurs, which is why the team's null checks inside the callables did not help — the problem is at the consumption site, not the production site.

---

### Issue 2: Timed-out future never cancelled

**Problem:** When a pricing task exceeds the two-second timeout, the engine stops waiting but never tells the executor to stop running the task. The thread in the pool stays busy executing the stalled task until it eventually finishes or the JVM shuts down. Under sustained pricing-service slowness, all four threads can end up occupied by timed-out tasks, and new submissions queue indefinitely.

**Fix:** `future.cancel(true)` is called inside the `catch (TimeoutException)` block immediately after the timeout is caught. The `true` argument sends an interrupt signal to the running thread, allowing tasks that respect interruption to stop promptly.

**Explanation:** `Future.get(timeout, unit)` only stops the *caller* from waiting; it has no effect on the thread actually running the task. Without `cancel`, that thread continues until the task completes on its own. With four threads in the pool and a pricing service that occasionally hangs for tens of seconds, all threads can be occupied by already-timed-out work. New tasks pile up in the executor's queue and `future.get()` on those queued tasks also times out, causing the entire checkout to return a zero total. Calling `future.cancel(true)` releases the thread back to the pool as soon as the task checks its interrupt flag or blocks on an interruptible operation like a socket read.

---

### Issue 3: ExecutionException cause silently dropped

**Problem:** When a pricing task throws an exception internally, `ExecutionException` is caught and discarded with a comment. There is no log entry, no metric, and no way for on-call engineers to know that a pricing task failed, what it failed with, or how often it happens. This makes it very hard to distinguish a misconfigured pricing service from a transient network blip.

**Fix:** A `logger.warning("Pricing task failed: " + e.getCause())` call is added inside the `catch (ExecutionException)` block, logging the wrapped cause of the failure.

**Explanation:** `ExecutionException` wraps the actual throwable thrown by the `Callable`. `e.getCause()` retrieves that original exception. Without logging it, a pricing task that always throws (for example, because a downstream URL changed) produces no observable signal except a consistently low or zero checkout total, which is easy to attribute to the wrong cause. Logging `e.getCause()` at `WARNING` level gives operators a concrete exception type and message to act on. A related pitfall: rethrowing `ExecutionException` directly would expose framework-internal stack frames; logging the cause keeps the information useful without changing the method's exception contract.
