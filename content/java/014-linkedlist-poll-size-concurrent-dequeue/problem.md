---
slug: linkedlist-poll-size-concurrent-dequeue
track: java
orderIndex: 14
title: Shared LinkedList Queue Race
difficulty: medium
tags:
  - concurrency
  - collections
  - thread-safety
language: java
---

## Context

This class is in `src/main/java/com/example/tasks/WorkQueue.java`. Multiple worker threads call `drain()` to pull tasks off the queue and process them in a background thread pool. A producer thread calls `enqueue()`. The queue is implemented using `java.util.LinkedList` because of its O(1) head removal.

## Buggy code

```java
import java.util.LinkedList;
import java.util.List;

public class WorkQueue {
    private final LinkedList<Runnable> queue = new LinkedList<>();

    public synchronized void enqueue(Runnable task) {
        queue.addLast(task);
        notifyAll();
    }

    public List<Runnable> drain() {
        List<Runnable> batch = new java.util.ArrayList<>();
        while (!queue.isEmpty()) {
            batch.add(queue.poll());
        }
        return batch;
    }

    public synchronized int pendingCount() {
        return queue.size();
    }
}
```
