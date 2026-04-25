---
slug: priority-queue-natural-order-reversed
track: java
orderIndex: 36
title: PriorityQueue Comparator Returns Wrong Max
difficulty: easy
tags:
  - collections
  - exceptions
  - correctness
language: java
---

## Context

This class lives in `src/main/java/com/example/scheduling/TaskScheduler.java`. The scheduler picks the highest-priority task from a queue of pending work items every time a worker thread asks for the next job. Priority is an integer where a higher number means more urgent work.

Operators notice that low-priority background tasks execute before urgent user-facing tasks. Adding detailed logging confirms that the task returned by `pollHighestPriority` has the lowest priority number in the queue rather than the highest. The queue always contains at least one element when `pollHighestPriority` is called.

The team checked that tasks are inserted with the correct priority values and that the priority field is set correctly on each `Task` object. The problem is entirely inside the queue ordering logic.

## Buggy code

```java
import java.util.PriorityQueue;
import java.util.Comparator;

public class TaskScheduler {

    public static class Task {
        final String name;
        final int priority;
        Task(String name, int priority) {
            this.name = name;
            this.priority = priority;
        }
    }

    // Higher priority number = more urgent
    private final PriorityQueue<Task> queue = new PriorityQueue<>(
            Comparator.comparingInt(t -> t.priority)
    );

    public void submit(Task task) {
        queue.offer(task);
    }

    public Task pollHighestPriority() {
        return queue.poll();
    }
}
```
