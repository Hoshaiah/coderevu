## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Thread Pool Shutdown Without Awaiting Termination
// ------------------------------------------------------------------------

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class ReportExporter {

    public void exportAll(List<String> reportIds) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(8);

        for (String id : reportIds) {
            pool.submit(() -> generateReport(id));
        }

        pool.shutdown();
        // CHANGE 1: awaitTermination blocks until all submitted tasks complete; shutdown() alone is non-blocking and returns immediately, so without this call writeIndex() would run before workers finish.
        // CHANGE 2: a finite timeout (1 hour here) prevents the calling thread from hanging silently if a worker stalls; the IllegalStateException gives operators a clear signal instead of a silent hang.
        if (!pool.awaitTermination(1, TimeUnit.HOURS)) {
            throw new IllegalStateException("Report generation did not complete within the expected time limit");
        }
        writeIndex(reportIds);
    }

    private void generateReport(String reportId) {
        // ... expensive report generation ...
    }

    private void writeIndex(List<String> ids) {
        // ... write index file listing all generated reports ...
    }
}
```

## Explanation

### Issue 1: `shutdown()` Is Non-Blocking

**Problem:** Operators see the index file written before many reports are generated. Timing logs show `writeIndex()` is called almost immediately after `pool.shutdown()`, even when dozens of workers are still running.

**Fix:** Add `pool.awaitTermination(1, TimeUnit.HOURS)` after `pool.shutdown()`. This call blocks the main thread until all previously submitted tasks have finished executing, so `writeIndex(reportIds)` only runs once every worker is done.

**Explanation:** `ExecutorService.shutdown()` tells the pool to stop accepting new tasks and to begin an orderly wind-down, but it returns immediately — it does not wait for in-flight tasks to finish. The main thread then races ahead and calls `writeIndex()` while workers are still generating reports. `awaitTermination()` is the separate blocking call that makes the main thread park until the pool reaches the terminated state or the timeout elapses. A common misconception is that `shutdown()` behaves like `join()` on a thread — it does not. You always need the `awaitTermination()` call if subsequent code depends on the tasks being complete.

---

### Issue 2: No Timeout Guard on `awaitTermination`

**Problem:** `awaitTermination` requires a timeout argument, and picking an unbounded or excessively large value without any reaction to expiry means a single stuck worker silently blocks the cron-triggered HTTP handler forever, eventually exhausting server threads.

**Fix:** Pass a concrete timeout (`1, TimeUnit.HOURS`) and check the boolean return value of `awaitTermination`. If it returns `false` (timeout elapsed before termination), throw an `IllegalStateException` so the caller and operators know something went wrong, rather than proceeding to write a potentially incomplete index.

**Explanation:** `awaitTermination` returns `true` if the pool terminated within the deadline and `false` if the deadline passed first. Ignoring the return value means you can call `writeIndex()` on a still-running pool — exactly the original bug, but delayed. Throwing on timeout surfaces the problem immediately in logs and stops the index from being written in a bad state. Choosing a timeout that is longer than any realistic report batch (one hour here) balances safety against false positives. For production use, you might also call `pool.shutdownNow()` after the timeout to interrupt lingering workers and release resources.
