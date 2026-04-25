## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Interrupted Status Cleared in Catch
// ------------------------------------------------------------------------

import java.util.concurrent.BlockingQueue;

public class BlockingWorker implements Runnable {
    private final BlockingQueue<String> queue;
    private volatile boolean running = true;

    public BlockingWorker(BlockingQueue<String> queue) {
        this.queue = queue;
    }

    @Override
    public void run() {
        while (running) {
            try {
                String item = queue.take();
                process(item);
            } catch (InterruptedException e) {
                // CHANGE 1: Restore the interrupt status so the JVM and executor can observe it; do not silently swallow it.
                Thread.currentThread().interrupt();
                // CHANGE 2: Set running = false so the while-loop condition turns false and the thread exits cleanly.
                running = false;
            }
        }
    }

    private void process(String item) {
        System.out.println("Processing: " + item);
    }
}
```

## Explanation

### Issue 1: Interrupt Status Silently Swallowed

**Problem:** When `queue.take()` is blocked and `Thread.interrupt()` is called, `take()` throws `InterruptedException` and clears the thread's interrupt flag as part of throwing. The catch block prints a message and returns to the top of the loop, but the interrupt flag is now `false`. The thread and the `ThreadPoolExecutor` have no way to know an interrupt happened, so `awaitTermination` times out and the server must forcibly kill the threads.

**Fix:** Add `Thread.currentThread().interrupt()` inside the catch block (the `// CHANGE 1` line). This re-sets the interrupt flag on the current thread immediately after catching the exception.

**Explanation:** `InterruptedException` is Java's mechanism for cooperative cancellation. When a blocking call like `take()` throws it, the JVM automatically clears the interrupt flag as part of delivering the exception — the flag is "consumed". If you catch the exception without re-setting the flag, any caller or framework that checks `Thread.isInterrupted()` (including `ThreadPoolExecutor` shutdown logic) will see a non-interrupted thread and assume work is still in progress. Calling `Thread.currentThread().interrupt()` re-raises the flag so the interrupted state is visible to the rest of the system. A related pitfall: if code deeper in a call stack catches `InterruptedException` and swallows it, the flag is also lost there — always restore it at whatever level you catch it but cannot propagate it.

---

### Issue 2: Loop Never Exits on Interrupt

**Problem:** Even if the interrupt status were preserved, the `while (running)` loop has no logic to set `running = false` when an interrupt arrives. The thread would loop back, call `take()` again, and continue processing indefinitely. The application server sees the threads still running after `shutdown()` and must wait the full `awaitTermination` timeout.

**Fix:** Add `running = false` inside the `InterruptedException` catch block (the `// CHANGE 2` line), so the loop condition becomes false after an interrupt and the `run()` method returns normally.

**Explanation:** The `running` flag exists to give external code a way to stop the worker, but nothing in the original code ever sets it to `false`. The executor signals the thread via `Thread.interrupt()`, not by reaching into the object and flipping `running`. Once `InterruptedException` is caught, the worker must decide to stop — setting `running = false` is that decision. Without it, even with the interrupt flag restored (Issue 1 fix), `take()` would throw again immediately on the next iteration if the flag is still set, causing a tight exception loop rather than a clean exit. Setting `running = false` ensures the thread falls out of the loop and the `run()` method returns, which is what the executor is waiting for.
