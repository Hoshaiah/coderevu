---
slug: iterator-remove-without-next
track: java
orderIndex: 44
title: Iterator Remove Before Next Call
difficulty: medium
tags:
  - collections
  - exceptions
  - iteration
language: java
---

## Context

This code lives in `src/main/java/com/example/queue/TaskQueue.java`, a background worker that drains a list of pending tasks. The `drainHighPriority` method is called every few seconds from a scheduler to pull out and return all high-priority tasks so they can be dispatched immediately, leaving lower-priority tasks in the queue.

In testing the method appears to work, but in production it intermittently throws `java.lang.IllegalStateException` with no useful message. The stack trace always points to the `it.remove()` call. The team confirmed that the list is never empty when the method is called, so they ruled out an empty-collection issue.

## Buggy code

```java
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

public class TaskQueue {
    private final List<Task> pending = new ArrayList<>();

    public List<Task> drainHighPriority() {
        List<Task> result = new ArrayList<>();
        Iterator<Task> it = pending.iterator();
        while (it.hasNext()) {
            Task t = it.next();
            if (t.isHighPriority()) {
                result.add(t);
                it.remove();
            } else if (t.isCancelled()) {
                it.remove();
                it.remove(); // remove twice to ensure it's gone
            }
        }
        return result;
    }
}
```
