---
slug: catch-generic-exception-hides-interrupt
track: java
orderIndex: 87
title: Catching Exception Swallows InterruptedException
difficulty: medium
tags:
  - exceptions
  - concurrency
  - error-handling
language: java
---

## Context

This class lives in `src/main/java/com/example/worker/RetryableTask.java` and wraps a unit of work that might fail transiently. It is submitted to a managed thread pool that uses `Thread.interrupt()` to signal graceful shutdown when the application receives a SIGTERM.

Operators report that during deployment rollouts, worker threads refuse to stop. The JVM takes the full 30-second kill timeout before the process is forcibly terminated. Heap dumps show threads stuck inside `RetryableTask.execute` even after the interrupt signal has been sent.

The team added logging to confirm `Thread.currentThread().isInterrupted()` returns `false` inside the loop even after shutdown is initiated. They have already verified that the thread pool itself calls `shutdownNow()` correctly.

## Buggy code

```java
import java.util.concurrent.TimeUnit;

public class RetryableTask {
    private static final int MAX_RETRIES = 5;
    private final Runnable work;

    public RetryableTask(Runnable work) {
        this.work = work;
    }

    public void execute() {
        int attempts = 0;
        while (attempts < MAX_RETRIES) {
            try {
                work.run();
                return;
            } catch (Exception e) {
                attempts++;
                try {
                    TimeUnit.SECONDS.sleep(1);
                } catch (Exception sleepEx) {
                    // ignore sleep interruptions, just retry faster
                }
            }
        }
    }
}
```
