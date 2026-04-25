## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Catching Error Hides JVM Failures
// ------------------------------------------------------------------------

import java.util.logging.Logger;

public class TaskRunner {
    private static final Logger LOG = Logger.getLogger(TaskRunner.class.getName());

    public void runTask(Runnable task) {
        try {
            task.run();
        // CHANGE 1: Catch only Exception, not Throwable, so Error subclasses (OutOfMemoryError, StackOverflowError, etc.) propagate and crash the thread rather than being silently swallowed.
        } catch (Exception t) {
            // CHANGE 2: Use toString() instead of getMessage() so the exception class name is always included, preventing 'null' log messages when getMessage() returns null.
            LOG.warning("Task failed, skipping: " + t.toString());
        }
    }
}
```

## Explanation

### Issue 1: `Throwable` catch swallows fatal JVM errors

**Problem:** The worker thread catches `OutOfMemoryError` and similar JVM `Error` subclasses, logs a single line, and then continues. The JVM's normal mechanism for propagating these errors — crashing the thread and triggering any registered `UncaughtExceptionHandler` — never fires. Operators see the thread go silent without any crash or alert.

**Fix:** Replace `catch (Throwable t)` with `catch (Exception t)`. `Error` and its subclasses are no longer caught, so they propagate up the call stack and terminate the thread normally.

**Explanation:** Java's throwable hierarchy splits into `Exception` (things application code is expected to handle) and `Error` (things the JVM signals when it is in serious trouble). `OutOfMemoryError` extends `Error`, not `Exception`. When `catch (Throwable t)` intercepts it, the JVM thinks the condition was handled and lets the thread keep running — but the heap is still exhausted, so the thread immediately enters a broken state: it can't allocate objects, enters tight retry loops, or simply hangs. Changing to `catch (Exception t)` means plugin `RuntimeException`s are still absorbed (the original goal), while `Error`s propagate and let the JVM do the right thing. A related pitfall: `ThreadDeath`, also an `Error`, is thrown internally when a thread is stopped via the deprecated `Thread.stop()`; swallowing it causes the same kind of invisible hang.

---

### Issue 2: `getMessage()` returns `null`, producing useless log output

**Problem:** Many `Error` and `RuntimeException` types are constructed without a detail message, so `getMessage()` returns `null`. The log line reads `Task failed, skipping: null`, which tells an operator nothing about the exception type or where it came from.

**Fix:** Replace `t.getMessage()` with `t.toString()`. `toString()` on any `Throwable` returns the fully-qualified class name followed by the message if one exists (e.g., `java.lang.NullPointerException: index was 3`), so the class name is always present even when no message was set.

**Explanation:** `Throwable.getMessage()` returns the string passed to the constructor, which is `null` when the no-argument constructor is used — common for `Error` subclasses like `OutOfMemoryError` that carry no message string. `Throwable.toString()` is specified to return `getClass().getName()` if `getMessage()` is null, or `getClass().getName() + ": " + getMessage()` otherwise. This means the log line always identifies the exception type at minimum. A stronger option would be `LOG.log(Level.WARNING, "Task failed, skipping", t)` to capture the full stack trace, but the minimal fix that directly addresses the null-message bug is switching to `toString()`.
