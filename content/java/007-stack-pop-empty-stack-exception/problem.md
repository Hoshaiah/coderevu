---
slug: stack-pop-empty-stack-exception
track: java
orderIndex: 7
title: Stack.empty() Race Before pop() Call
difficulty: medium
tags:
  - concurrency
  - exceptions
  - collections
language: java
---

## Context

This class is `src/main/java/com/example/undo/UndoManager.java`. It manages an undo stack for a collaborative document editor. Multiple UI event threads can push and pop undo actions. The developer used `java.util.Stack`, which is synchronized, believing that made the code thread-safe.

Users sporadically report an `EmptyStackException` crashing the editor when they rapidly click the Undo button. Stack traces point to the `undo()` method. The bug is not reproducible on a slow single-click, and never in unit tests that run on one thread.

The team noticed that `Stack` extends `Vector` and is synchronized on each individual method call. They concluded the class is thread-safe and looked elsewhere. The actual bug is still in this code.

## Buggy code

```java
import java.util.Stack;

public class UndoManager {
    private final Stack<Runnable> history = new Stack<>();

    public void push(Runnable action) {
        history.push(action);
    }

    public void undo() {
        if (!history.empty()) {
            history.pop().run();
        }
    }

    public int size() {
        return history.size();
    }
}
```
