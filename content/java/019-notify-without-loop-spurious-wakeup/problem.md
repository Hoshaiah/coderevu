---
slug: notify-without-loop-spurious-wakeup
track: java
orderIndex: 19
title: Wait Without Loop for Spurious Wakeups
difficulty: hard
tags:
  - concurrency
  - correctness
  - threading
language: java
---

## Context

This code lives in `src/main/java/com/example/pipeline/DataBuffer.java`, a bounded producer-consumer buffer used to pass batches of parsed log lines from an I/O thread to a processing thread. The buffer uses `wait()`/`notifyAll()` for coordination. It has a maximum capacity and producers block when full; consumers block when empty.

Under heavy load the processing thread occasionally wakes up and calls `take()` on an empty buffer, receiving `null` and causing a `NullPointerException` several frames up the call stack in the processing logic. The bug is non-deterministic and more frequent on machines with many cores. It has never occurred in single-threaded tests. The team has confirmed that producers always call `notifyAll()` after adding an item.

## Buggy code

```java
import java.util.ArrayDeque;
import java.util.Deque;

public class DataBuffer {
    private final Deque<String> buffer = new ArrayDeque<>();
    private final int capacity;

    public DataBuffer(int capacity) {
        this.capacity = capacity;
    }

    public synchronized void put(String item) throws InterruptedException {
        if (buffer.size() == capacity) {
            wait();
        }
        buffer.addLast(item);
        notifyAll();
    }

    public synchronized String take() throws InterruptedException {
        if (buffer.isEmpty()) {
            wait();
        }
        notifyAll();
        return buffer.removeFirst();
    }
}
```
