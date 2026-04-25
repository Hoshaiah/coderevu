---
slug: lost-wakeup-without-while-loop-condition
track: java
orderIndex: 29
title: Spurious Wakeup in wait Without Loop
difficulty: hard
tags:
  - concurrency
  - exceptions
  - correctness
language: java
---

## Context

`WorkQueue.java` is a hand-rolled blocking queue used in a custom job scheduler. Producer threads call `enqueue` to add jobs, and a single consumer thread calls `dequeue` to retrieve them. The code predates the team's adoption of `java.util.concurrent` and is considered stable legacy code.

In production, the consumer thread occasionally throws `NoSuchElementException` when calling `jobs.removeFirst()`. The failure rate is low — roughly once per 10,000 dequeues — and cannot be reproduced in unit tests. Thread dumps at the time of failure always show the consumer thread inside `dequeue` just after `wait()` returns.

The team confirmed no `InterruptedException` is silently swallowed and that the exception is not thrown during shutdown. Adding extra logging showed `jobs.isEmpty()` is `true` at the moment `removeFirst()` is called.

## Buggy code

```java
import java.util.LinkedList;

public class WorkQueue {
    private final LinkedList<Runnable> jobs = new LinkedList<>();
    private final Object lock = new Object();

    public void enqueue(Runnable job) {
        synchronized (lock) {
            jobs.addLast(job);
            lock.notifyAll();
        }
    }

    public Runnable dequeue() throws InterruptedException {
        synchronized (lock) {
            if (jobs.isEmpty()) {
                lock.wait();
            }
            return jobs.removeFirst();
        }
    }
}
```
