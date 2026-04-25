---
slug: interrupted-status-cleared
track: java
orderIndex: 5
title: Interrupted Status Cleared in Catch
difficulty: medium
tags:
  - concurrency
  - exceptions
  - thread-safety
language: java
---

## Context

`src/main/java/com/acme/queue/BlockingWorker.java` is a long-running background worker that drains a `BlockingQueue`. It is managed by a `ThreadPoolExecutor` whose shutdown lifecycle calls `Thread.interrupt()` on the worker thread to signal it to stop. The worker is supposed to exit cleanly when interrupted.

When the application server is asked to shut down gracefully, the worker threads do not stop. The executor's `awaitTermination` call times out after 30 seconds, and the threads have to be killed forcibly. Logs show the workers continuing to emit processing messages long after `shutdown()` was called.

The team confirmed that `Thread.interrupt()` is definitely being called (adding a log before it shows the call happening), and that the thread is blocked on `queue.take()` at the moment of the interrupt.

## Buggy code

```java
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
                // Log and continue — don't let one interrupt kill the worker
                System.err.println("Worker interrupted, continuing: " + e.getMessage());
            }
        }
    }

    private void process(String item) {
        System.out.println("Processing: " + item);
    }
}
```
