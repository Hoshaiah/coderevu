## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — CallerRunsPolicy causes HTTP request threads to block on slow background tasks
// ------------------------------------------------------------------------
import java.util.concurrent.*;
import java.util.logging.Logger;

public class ImageResizeService {

    private static final Logger log = Logger.getLogger(ImageResizeService.class.getName());

    // CHANGE 1: Replace CallerRunsPolicy with a custom policy that logs and discards instead of running the task on the calling (HTTP request) thread.
    private final RejectedExecutionHandler rejectionHandler = (task, executor) -> {
        log.warning("Image resize task rejected — queue full. Task dropped.");
        // CHANGE 3: Record rejection explicitly (log, metric, or throw) so operators see backpressure.
    };

    // CHANGE 2: Increase core/max pool size and queue capacity to reduce rejection frequency under moderate spikes without blocking request threads.
    private final Executor executor = new ThreadPoolExecutor(
            8, 8,
            60L, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(100),
            rejectionHandler
    );

    public void resizeAsync(byte[] imageData, String targetPath) {
        executor.execute(() -> {
            resize(imageData, targetPath);
        });
    }

    private void resize(byte[] imageData, String targetPath) {
        // CPU-intensive resizing — takes ~500ms
    }
}
```

## Explanation

### Issue 1: CallerRunsPolicy blocks HTTP threads

**Problem:** When the `ArrayBlockingQueue` fills up, `CallerRunsPolicy` makes the thread that called `executor.execute()` run the rejected task itself. In a Spring Boot service that thread is an HTTP request thread from the servlet container pool. It spends ~500ms doing CPU-intensive resizing, and during that time it cannot serve any new requests. Users see the `/upload` endpoint hang.

**Fix:** Replace `ThreadPoolExecutor.CallerRunsPolicy` with a custom `RejectedExecutionHandler` (the `rejectionHandler` field at `CHANGE 1`) that logs and discards the task instead of executing it on the caller's thread.

**Explanation:** `CallerRunsPolicy` was designed as a simple backpressure mechanism for producer threads that the application controls, such as a background scheduler. HTTP request threads are shared infrastructure managed by Tomcat or Jetty; tying them up with long CPU work starves other requests. When one request thread is busy resizing, the server has one fewer thread to accept new connections or process other endpoints. During a traffic spike, multiple threads can get stuck simultaneously, and the thread pool appears exhausted even though the work is supposed to be asynchronous. Discarding with a log entry keeps request threads free and makes the overload visible rather than silently degrading latency.

---

### Issue 2: Pool and queue too small for moderate spikes

**Problem:** Four threads and a queue depth of 10 means the executor reaches its rejection threshold after just 14 concurrent tasks. Under even moderate traffic this happens quickly, triggering the problematic rejection policy repeatedly.

**Fix:** At `CHANGE 2`, the core and max pool size is raised from `4` to `8`, the queue capacity grows from `10` to `100`, and the keep-alive is set to `60L, TimeUnit.SECONDS` so threads can eventually be reclaimed if load drops.

**Explanation:** The original numbers were likely chosen arbitrarily. With ~500ms tasks and 4 threads, the executor can complete at most 8 tasks per second; a queue of 10 fills in under 2 seconds of sustained load above that rate. Doubling the thread count and increasing the queue depth buys more headroom before any rejection occurs. Setting a non-zero keep-alive (instead of `0L`) means extra threads are not kept forever when traffic subsides, which reduces idle CPU usage. Note that pool size should still be tuned to the number of available CPU cores — blindly increasing it on a 4-core host would just cause context-switching overhead instead.

---

### Issue 3: Silent rejection gives no operational visibility

**Problem:** With `CallerRunsPolicy` in place the operator has no signal that the queue ever fills up, because the work just shifts silently to a different thread. After switching to a discard policy, tasks can be dropped without anyone knowing, which makes capacity planning and incident diagnosis difficult.

**Fix:** At `CHANGE 3`, the custom rejection handler logs a `WARNING` message each time a task is dropped. In production this log line should additionally increment a metrics counter (e.g., a Micrometer `Counter`) so alerting dashboards can fire when the drop rate exceeds a threshold.

**Explanation:** `ThreadPoolExecutor.DiscardPolicy`, the built-in alternative to `CallerRunsPolicy`, silently swallows rejected tasks with no log or metric. Operators then see user-reported failures — missing resized images — with no corresponding server-side signal. A custom handler that at minimum logs the rejection turns an invisible failure into a visible one. Over time, monitoring the rate of rejections tells the team whether the pool is consistently undersized and needs a permanent increase, or whether spikes are rare enough that the current sizing is acceptable.
