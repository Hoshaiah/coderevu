## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — InterruptedException Swallowed in Loop
// ------------------------------------------------------------------------

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

public class RetryWorker implements Runnable {
    private final BlockingQueue<Task> queue;
    private volatile boolean running = true;
    // CHANGE 2: store the worker thread so stop() can interrupt it, waking a blocking poll() immediately
    private volatile Thread workerThread;

    public RetryWorker(BlockingQueue<Task> queue) {
        this.queue = queue;
    }

    public void stop() {
        running = false;
        // CHANGE 2: interrupt the blocked thread so poll() throws InterruptedException right away instead of waiting up to 5 seconds
        Thread t = workerThread;
        if (t != null) {
            t.interrupt();
        }
    }

    @Override
    public void run() {
        // CHANGE 2: capture the running thread so stop() can interrupt it
        workerThread = Thread.currentThread();
        // CHANGE 1: also exit the loop if the thread's interrupted status is set, in case the framework interrupts without calling stop()
        while (running && !Thread.currentThread().isInterrupted()) {
            try {
                Task task = queue.poll(5, TimeUnit.SECONDS);
                if (task != null) {
                    task.execute();
                }
            } catch (InterruptedException e) {
                // CHANGE 1: restore the interrupted status so callers and the loop condition can observe it, then exit cleanly
                Thread.currentThread().interrupt();
                break;
            }
        }
    }
}
```

## Explanation

### Issue 1: InterruptedException Swallowed, Status Lost

**Problem:** When the framework calls `Thread.interrupt()` on the worker thread, `queue.poll()` throws `InterruptedException` and also clears the thread's interrupted status. The catch block does nothing with the exception, so both the exception and the interrupted status are discarded. The loop keeps running as if nothing happened, and the thread never stops.

**Fix:** In the `catch (InterruptedException e)` block, add `Thread.currentThread().interrupt()` to restore the interrupted status, then `break` out of the loop. The `while` condition is also extended to check `!Thread.currentThread().isInterrupted()` as a secondary guard.

**Explanation:** `BlockingQueue.poll(timeout, unit)` is specified to clear the thread's interrupted status when it throws `InterruptedException`. If the catch block does not call `Thread.currentThread().interrupt()`, that status is gone and nothing in the call stack above can detect that an interrupt was requested. Calling `Thread.currentThread().interrupt()` re-sets the flag so any subsequent blocking call or status check will also see it. The `break` statement then exits the loop immediately rather than relying on the `while` condition to be re-evaluated. A related pitfall: if `task.execute()` itself blocks and the interrupted status was swallowed earlier, that inner blocking call also won't wake up on shutdown.

---

### Issue 2: `stop()` Does Not Interrupt the Blocked Thread

**Problem:** `stop()` sets `running = false`, but the thread is blocked inside `queue.poll(5, TimeUnit.SECONDS)` for up to five seconds. The flag is not checked again until `poll()` returns, so the thread continues to run for up to five more seconds per iteration after `stop()` is called. With multiple workers, this causes the observed 30-second-plus shutdown delay.

**Fix:** Store the worker's `Thread` reference in `workerThread` at the start of `run()`. In `stop()`, after setting `running = false`, call `workerThread.interrupt()` to wake the blocked `poll()` call immediately.

**Explanation:** `BlockingQueue.poll(timeout, unit)` responds to interrupts: when `Thread.interrupt()` is called on a thread blocked in `poll()`, the method throws `InterruptedException` right away instead of waiting for the timeout to expire. By capturing the `Thread` reference and calling `interrupt()` from `stop()`, the shutdown latency drops from up to one full timeout period to near-zero. The `workerThread` field is declared `volatile` so the write in `run()` is visible to the thread calling `stop()`. A subtle ordering risk: `stop()` could be called before `run()` assigns `workerThread`, so a null check guards the interrupt call.
