---
slug: stack-empty-check-race
track: java
orderIndex: 22
title: Stack Empty Check Before Pop Race
difficulty: hard
tags:
  - concurrency
  - collections
  - exceptions
language: java
---

## Context

This work-stealing queue lives in `src/main/java/com/example/worker/WorkStealingQueue.java`. Multiple worker threads call `trySteal()` to grab tasks from a shared `Stack` when their own local queues run dry. The stack is shared across all workers and protected — or so the developers believed — by checking `isEmpty()` before calling `pop()`.

In production under high concurrency, threads intermittently crash with `EmptyStackException`. The stack trace always points to the `stack.pop()` inside `trySteal()`. The check `stack.isEmpty()` was added specifically to prevent this, and developers are puzzled why the exception still occurs.

Load testing with 32 threads reproduces the crash reliably within a few seconds. Reducing to a single thread makes it disappear entirely. The `Stack` class is documented as thread-safe (it extends `Vector`), which led the team to believe no additional synchronization was needed.

## Buggy code

```java
import java.util.Stack;

public class WorkStealingQueue {

    private final Stack<Runnable> stack = new Stack<>();

    public void push(Runnable task) {
        stack.push(task);
    }

    public Runnable trySteal() {
        if (!stack.isEmpty()) {
            return stack.pop();
        }
        return null;
    }

    public int size() {
        return stack.size();
    }
}
```
