## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Catching Exception Swallows InterruptedException
// ------------------------------------------------------------------------

import java.util.concurrent.TimeUnit;

public class RetryableTask {
    private static final int MAX_RETRIES = 5;
    private final Runnable work;

    public RetryableTask(Runnable work) {
        this.work = work;
    }

    public void execute() throws InterruptedException {
        int attempts = 0;
        while (attempts < MAX_RETRIES) {
            try {
                work.run();
                return;
            // CHANGE 2: catch only RuntimeException (not Exception) so InterruptedException thrown by work propagates up rather than being swallowed.
            } catch (RuntimeException e) {
                attempts++;
                try {
                    TimeUnit.SECONDS.sleep(1);
                // CHANGE 1: catch InterruptedException specifically and re-interrupt the thread before returning, restoring the flag cleared by sleep() and allowing the pool to shut down.
                } catch (InterruptedException sleepEx) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }
}
```

## Explanation

### Issue 1: Sleep InterruptedException Swallowed

**Problem:** When the thread pool calls `shutdownNow()`, it interrupts each worker thread. `TimeUnit.SECONDS.sleep(1)` responds by throwing `InterruptedException` and, critically, clearing the thread's interrupt flag. The original code catches this as `Exception` and ignores it entirely, so the flag stays cleared and the loop continues. Operators see threads still running long after the 30-second shutdown deadline.

**Fix:** Replace `catch (Exception sleepEx)` with `catch (InterruptedException sleepEx)`, then call `Thread.currentThread().interrupt()` to restore the flag, and `return` to exit the retry loop immediately.

**Explanation:** `Thread.sleep` (and wrappers like `TimeUnit.SECONDS.sleep`) follow a contract: when interrupted they throw `InterruptedException` AND clear the interrupt flag. If you catch that exception without re-setting the flag, any subsequent call to `isInterrupted()` returns `false`, and any caller higher up the stack that checks the flag will never see that the thread was asked to stop. Calling `Thread.currentThread().interrupt()` re-sets the flag before you exit, so the thread pool and any other caller can observe the interrupted state correctly. A related pitfall: if you need to finish the current attempt before stopping, you can save the interrupt status and re-apply it after, but you must never silently discard it.

---

### Issue 2: Outer Catch Masks InterruptedException from Work

**Problem:** If the `Runnable` passed as `work` internally calls a blocking method (like `Object.wait()` or another `sleep`) and that method throws `InterruptedException`, the outer `catch (Exception e)` block catches it. This again swallows the signal, increments the retry counter, and keeps looping, so a shutdown request originating inside the task is also ignored.

**Fix:** Change `catch (Exception e)` to `catch (RuntimeException e)`. Because `InterruptedException` is a checked exception that extends `Exception` (not `RuntimeException`), it will no longer be caught here. The method signature is updated to `throws InterruptedException` so the exception propagates to the caller.

**Explanation:** Java's exception hierarchy means `catch (Exception e)` is a catch-all for both checked and unchecked exceptions, including `InterruptedException`. Narrowing to `catch (RuntimeException e)` restricts the handler to unchecked exceptions, which is what transient task failures typically are (e.g., network timeouts wrapped in `RuntimeException`). Any `InterruptedException` thrown by `work.run()` will bypass the handler and propagate up the call stack to the thread pool, which can then properly record that the task was interrupted. If `work` only ever throws checked exceptions other than `InterruptedException`, those should be caught and handled explicitly rather than relying on a broad `Exception` catch.
