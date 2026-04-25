## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — CompletableFuture Exception Silently Dropped
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.logging.Logger;

public class EmailDispatcher {
    private static final Logger LOG = Logger.getLogger(EmailDispatcher.class.getName());
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final EmailClient emailClient;

    public EmailDispatcher(EmailClient emailClient) {
        this.emailClient = emailClient;
    }

    public void flush(List<EmailMessage> queue) {
        // CHANGE 3: collect futures so callers can track completion and so exceptionally() has a reference to attach to
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        for (EmailMessage msg : queue) {
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                try {
                    emailClient.send(msg);
                } catch (Exception e) {
                    // CHANGE 2: log at SEVERE with full exception object (not just getMessage()) to preserve stack trace and handle null messages
                    LOG.log(Level.SEVERE, "Failed to send email to: " + msg.to, e);
                    // re-throw so the future records an exceptional completion and exceptionally() fires
                    throw new RuntimeException(e);
                }
            }, executor)
            // CHANGE 1: attach exceptionally() handler so any uncaught RuntimeException or Error propagated through the future is also logged, not silently dropped
            .exceptionally(ex -> {
                LOG.log(Level.SEVERE, "Unhandled exception in email dispatch future", ex);
                return null;
            });
            futures.add(future);
        }
        // CHANGE 3: wait for all futures so flush() does not return before sends are attempted and queue removal is safe
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
    }

    interface EmailClient {
        void send(EmailMessage msg) throws Exception;
    }

    static class EmailMessage {
        String to;
        String body;
    }
}
```

## Explanation

### Issue 1: Discarded future silences uncaught exceptions

**Problem:** `CompletableFuture.runAsync()` returns a `CompletableFuture<Void>` that the original code ignores. If the lambda throws a `RuntimeException` or `Error` that bypasses the catch block — or if any future stage faults — the exception is stored inside the future object and never observed. The ops team sees no log entry even though the SMTP layer is throwing.

**Fix:** The return value of `runAsync()` is captured and an `.exceptionally()` handler is chained onto it at the `CHANGE 1` site. The handler calls `LOG.log(Level.SEVERE, ...)` with the throwable so any fault that reaches the future boundary is logged.

**Explanation:** `CompletableFuture` works like a box: when the async task throws, the exception is placed in the box and the future moves to the "exceptionally completed" state. Nothing logs or rethrows that exception unless some code calls `.get()`, `.join()`, or attaches a `.exceptionally()` / `.handle()` callback. Because the original code discards the reference, no code ever opens the box. Chaining `.exceptionally()` registers a callback that fires immediately when the future faults, giving you a guaranteed log site. A related pitfall: even with `.exceptionally()` attached, if you lose the chained reference the callback may still be GC'd before it fires on some JVM implementations, so storing `future` in a list (CHANGE 3) is also necessary.

---

### Issue 2: Exception logged with getMessage() losing stack trace and null messages

**Problem:** The original catch block calls `LOG.severe("Failed to send email: " + e.getMessage())`. Many exception types set no detail message, so `e.getMessage()` returns `null`, producing the log line `Failed to send email: null`. Even when a message exists, the stack trace is completely absent, so the ops team cannot tell which line of code failed.

**Fix:** At the `CHANGE 2` site, `LOG.severe(String)` is replaced with `LOG.log(Level.SEVERE, String, Throwable)`. The third argument is the caught exception `e`, which causes `java.util.logging` to append the full stack trace to the log record automatically.

**Explanation:** `Logger.severe(String)` only records the string you pass — the `Throwable` object is not attached, so the logging framework never formats a stack trace. `Logger.log(Level, String, Throwable)` stores the exception in the `LogRecord` and every standard handler (console, file) knows to call `e.printStackTrace()`-equivalent formatting on it. Additionally, wrapping the checked exception in a `RuntimeException` and rethrowing it allows the fault to propagate into the future's exceptional state, which is required for the `.exceptionally()` handler in CHANGE 1 to fire.

---

### Issue 3: Futures not tracked, flush returns before sends complete

**Problem:** Because no futures are retained, `flush()` returns almost immediately after submitting the tasks to the executor. The `@Scheduled` caller (or any caller that removes messages from the queue after `flush()` returns) treats messages as delivered when they have only been submitted. If the JVM shuts down or the next scheduled run starts before the executor threads finish, sends are lost without any error.

**Fix:** At the `CHANGE 3` sites, futures are collected into `List<CompletableFuture<Void>> futures` and `CompletableFuture.allOf(...).join()` is called at the end of `flush()` to block until all sends (or their error handling) have completed before the method returns.

**Explanation:** `ExecutorService.submit()` and `CompletableFuture.runAsync()` are fire-and-forget unless you hold a reference and explicitly wait. The `@Scheduled` method on a 30-second interval can start a second invocation while the first batch is still in flight, causing double-dispatch or race conditions on queue removal. Calling `.join()` on the combined future makes `flush()` synchronous from the caller's perspective: it returns only after every send attempt has either succeeded or been handled by the `.exceptionally()` callback, giving the scheduler a clean boundary to work with.
