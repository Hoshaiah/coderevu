---
slug: catching-error-subclass
track: java
orderIndex: 75
title: Catching Error Hides JVM Failures
difficulty: easy
tags:
  - exceptions
  - error-handling
  - correctness
language: java
---

## Context

`src/main/java/com/acme/worker/TaskRunner.java` is a background job executor that wraps arbitrary `Runnable` tasks submitted by plugin code. The intent of the broad catch block is to prevent one bad plugin from killing the worker thread — a reasonable goal. The runner logs the problem and moves on to the next task.

Operators have reported that the worker thread occasionally becomes completely unresponsive: it stops processing tasks and emits no more logs, but the JVM process stays alive. Heap dumps show the thread stuck in an infinite loop or consuming all available memory. The application never receives the `OutOfMemoryError` that the JVM would normally propagate.

The on-call engineer added extra logging and confirmed that the `catch` block *is* being entered before the thread goes silent, so the exception is being swallowed rather than crashing the thread.

## Buggy code

```java
import java.util.logging.Logger;

public class TaskRunner {
    private static final Logger LOG = Logger.getLogger(TaskRunner.class.getName());

    public void runTask(Runnable task) {
        try {
            task.run();
        } catch (Throwable t) {
            LOG.warning("Task failed, skipping: " + t.getMessage());
        }
    }
}
```
