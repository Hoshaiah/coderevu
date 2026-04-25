---
slug: iterator-shared-across-threads
track: java
orderIndex: 13
title: Iterator Shared Across Threads
difficulty: medium
tags:
  - concurrency
  - collections
  - iterator
language: java
---

## Context

This batch processor lives in `src/main/java/com/example/batch/ParallelBatchProcessor.java` and processes a large snapshot of records by splitting the work across a fixed thread pool. The iterator over the snapshot is created once and each worker thread calls `next()` to pull its next item. The snapshot is an unmodifiable list so no structural modifications occur during iteration.

In production, runs occasionally skip records or process the same record twice, and rarely throw `NoSuchElementException` from inside a worker thread. The number of processed records at the end of a run does not match the input size. The bug is non-deterministic and harder to reproduce under low load.

The team ruled out the underlying list being modified during the run (it is wrapped in `Collections.unmodifiableList`) and verified that the total number of submitted tasks matches the list size. They have not yet considered whether the iterator itself is thread-safe.

## Buggy code

```java
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class ParallelBatchProcessor {
    private final ExecutorService pool = Executors.newFixedThreadPool(8);

    public void process(List<Record> snapshot) throws InterruptedException {
        Iterator<Record> it = snapshot.iterator();
        while (it.hasNext()) {
            Record record = it.next();
            pool.submit(() -> handle(record));
        }
        pool.shutdown();
        pool.awaitTermination(1, TimeUnit.HOURS);
    }

    private void handle(Record record) {
        // expensive processing
    }
}
```
