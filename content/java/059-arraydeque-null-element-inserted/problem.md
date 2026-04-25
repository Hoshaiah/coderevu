---
slug: arraydeque-null-element-inserted
track: java
orderIndex: 59
title: ArrayDeque Silently Rejects Null Elements
difficulty: easy
tags:
  - nulls
  - collections
  - exceptions
language: java
---

## Context

This code lives in `src/main/java/com/example/pipeline/TaskQueue.java`, a thin wrapper around a work queue used by the background processing service. Tasks are enqueued from an HTTP handler and dequeued by a thread-pool worker. The surrounding stack is plain Java with no frameworks — just `java.util` and `java.util.concurrent`.

In production, operators notice that certain task submissions silently disappear. No error is logged, the HTTP handler returns 200 OK, but the task never executes. The bug is reproducible whenever a task with a null payload is submitted, which happens legitimately when the upstream system sends a "heartbeat" sentinel.

The team already confirmed that the worker thread is running and consuming from the queue normally. They added logging before and after `offer()` and saw the call return, but never found the task on the other end.

## Buggy code

```java
import java.util.ArrayDeque;
import java.util.Queue;

public class TaskQueue {
    private final Queue<String> queue = new ArrayDeque<>();

    public boolean submit(String payload) {
        return queue.offer(payload);
    }

    public String take() {
        return queue.poll();
    }

    public int size() {
        return queue.size();
    }
}
```
