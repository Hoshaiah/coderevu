---
slug: catching-interrupted-exception-in-loop
track: java
orderIndex: 89
title: InterruptedException Swallowed in Loop
difficulty: medium
tags:
  - exceptions
  - concurrency
  - error-handling
language: java
---

## Context

This worker class lives in `src/main/java/com/example/worker/RetryWorker.java` and is submitted to a managed `ExecutorService`. Its job is to poll a queue with a timeout and process each item, retrying up to a configurable number of times on transient failures. The surrounding framework shuts down workers by calling `Thread.interrupt()` on the underlying thread.

Operators report that during application shutdown the worker threads do not stop promptly. The JVM takes over 30 seconds to exit even after all other components have cleanly shut down. Thread dumps show the worker threads stuck in the polling loop long after the shutdown signal was sent.

The team added a volatile `running` flag and confirmed it is set to `false` during shutdown. When the flag was the only guard, it worked, but the queue's blocking `poll(timeout)` call means the flag is not checked until the timeout expires. They expected the interrupt to wake up the blocking call immediately.

## Buggy code

```java
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

public class RetryWorker implements Runnable {
    private final BlockingQueue<Task> queue;
    private volatile boolean running = true;

    public RetryWorker(BlockingQueue<Task> queue) {
        this.queue = queue;
    }

    public void stop() {
        running = false;
    }

    @Override
    public void run() {
        while (running) {
            try {
                Task task = queue.poll(5, TimeUnit.SECONDS);
                if (task != null) {
                    task.execute();
                }
            } catch (InterruptedException e) {
                // poll was interrupted, just continue the loop
            }
        }
    }
}
```
