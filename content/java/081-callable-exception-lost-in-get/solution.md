## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — ExecutionException Cause Silently Dropped
// ------------------------------------------------------------------------

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.io.IOException;

public class ThumbnailService {

    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    public byte[] generate(String imageUrl) throws IOException {
        Callable<byte[]> task = () -> downloadAndResize(imageUrl);
        Future<byte[]> future = pool.submit(task);
        try {
            return future.get();
        } catch (ExecutionException e) {
            // CHANGE 1: Unwrap the ExecutionException cause and rethrow it typed so callers see IOException instead of RuntimeException; wrap only if the cause is not already an IOException.
            Throwable cause = e.getCause();
            if (cause instanceof IOException) {
                throw (IOException) cause;
            }
            throw new RuntimeException("Thumbnail generation failed", cause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            // CHANGE 2: Throw IOException instead of RuntimeException so the HTTP handler's catch(IOException) block can handle interruption with a typed, descriptive response.
            throw new IOException("Interrupted waiting for thumbnail", e);
        }
    }

    private byte[] downloadAndResize(String url) throws IOException {
        throw new IOException("Connection refused: " + url);
    }
}
```

## Explanation

### Issue 1: ExecutionException Cause Never Unwrapped

**Problem:** When `downloadAndResize` throws an `IOException`, the thread pool wraps it inside an `ExecutionException`. The buggy code catches `ExecutionException` and immediately wraps the whole thing in a `RuntimeException`. The original `IOException` is buried two levels deep, so the HTTP handler's `catch (IOException e)` block never matches and operators see a generic 500 with no useful message.

**Fix:** After catching `ExecutionException`, call `e.getCause()` and check whether it is an `IOException`. If it is, cast and rethrow it directly with `throw (IOException) cause`. Only fall back to `RuntimeException` when the cause is some other type.

**Explanation:** `Future.get()` always wraps task exceptions in `ExecutionException` — that is the contract of the API. The real exception is one level down at `getCause()`. When you skip that unwrapping step and throw a `RuntimeException` instead, the JVM looks for a matching `catch (RuntimeException)` handler up the call stack and finds it before the `catch (IOException)` handler ever gets a chance to run. Calling `getCause()` and rethrowing the original `IOException` restores the exception type the HTTP handler was written to handle. A related pitfall: if the task can throw checked exceptions other than `IOException`, you need to handle those branches separately or they will fall through to the generic `RuntimeException` wrapper.

---

### Issue 2: InterruptedException Rethrown as RuntimeException

**Problem:** When the thread waiting on `future.get()` is interrupted, the code correctly restores the interrupt flag but then throws a `RuntimeException`. This bypasses the HTTP handler's `catch (IOException e)` block, so interruptions produce the same confusing generic 500 response as any untyped failure.

**Fix:** Replace `throw new RuntimeException("Interrupted waiting for thumbnail", e)` with `throw new IOException("Interrupted waiting for thumbnail", e)` so the exception matches the method's declared `throws IOException` and the HTTP handler processes it the same way as other thumbnail failures.

**Explanation:** The method signature already declares `throws IOException`, so throwing `IOException` here is both legal and correct. Throwing `RuntimeException` is legal too — it is unchecked — but it escapes the `IOException` catch block entirely. Wrapping `InterruptedException` as the cause of the new `IOException` preserves the original stack trace so operators can still see that the failure was due to interruption rather than a network error. Restoring the interrupt flag with `Thread.currentThread().interrupt()` before throwing is still necessary regardless of which exception type you throw, because the act of catching `InterruptedException` clears the flag.
