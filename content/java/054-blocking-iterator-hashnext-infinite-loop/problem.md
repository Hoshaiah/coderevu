---
slug: blocking-iterator-hashnext-infinite-loop
track: java
orderIndex: 54
title: hasNext Loop on Empty Iterator
difficulty: hard
tags:
  - collections
  - exceptions
  - concurrency
language: java
---

## Context

This processor is in `src/main/java/com/example/pipeline/ResultDrainer.java`. It drains results from a `BlockingQueue` by obtaining its iterator and consuming all elements. It was ported from a version that used a regular `ArrayDeque`, and the developer believed that iterating over a `BlockingQueue` would also return elements in insertion order and handle concurrency safely.

## Buggy code

```java
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.Iterator;
import java.util.ArrayList;
import java.util.List;

public class ResultDrainer {
    private final BlockingQueue<String> queue;

    public ResultDrainer(BlockingQueue<String> queue) {
        this.queue = queue;
    }

    public List<String> drainAll() {
        List<String> results = new ArrayList<>();
        Iterator<String> it = queue.iterator();
        while (it.hasNext()) {
            results.add(it.next());
            it.remove();
        }
        return results;
    }
}
```
