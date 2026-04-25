---
slug: blocking-queue-size-toctou
track: java
orderIndex: 27
title: BlockingQueue Size Check Race Condition
difficulty: hard
tags:
  - concurrency
  - collections
  - correctness
language: java
---

## Context

This rate-limiter queue lives at `src/main/java/com/example/queue/BoundedTaskQueue.java`. It is used to cap the number of pending background tasks to avoid overwhelming a downstream API. Multiple producer threads call `enqueue` concurrently. The queue is backed by a `LinkedBlockingQueue` with an unbounded capacity — the bound is enforced manually to allow custom rejection behavior.

In production the queue regularly exceeds its declared maximum size, especially under burst traffic. The monitoring dashboard shows `queue.size()` reaching two or three times the configured `maxSize` during spikes. Tasks that should have been rejected are accepted, overloading the downstream API.

The developers are surprised because they check the size before adding. They have ruled out configuration issues — `maxSize` is set correctly at startup.

## Buggy code

```java
import java.util.concurrent.LinkedBlockingQueue;

public class BoundedTaskQueue {
    private final LinkedBlockingQueue<Runnable> queue = new LinkedBlockingQueue<>();
    private final int maxSize;

    public BoundedTaskQueue(int maxSize) {
        this.maxSize = maxSize;
    }

    public boolean enqueue(Runnable task) {
        if (queue.size() < maxSize) {
            queue.add(task);
            return true;
        }
        return false;
    }

    public Runnable dequeue() throws InterruptedException {
        return queue.take();
    }
}
```
