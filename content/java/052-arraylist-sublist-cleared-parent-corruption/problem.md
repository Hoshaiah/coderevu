---
slug: arraylist-sublist-cleared-parent-corruption
track: java
orderIndex: 52
title: SubList Clear Corrupts Parent List
difficulty: medium
tags:
  - collections
  - exceptions
  - correctness
language: java
---

## Context

`BatchProcessor.java` is a background job that reads a large list of pending work items from a database, processes them in chunks, and marks each chunk done by removing processed items. It lives in a Spring `@Scheduled` component and runs every 30 seconds.

Operators noticed that after the first batch run, the full list of work items appears mostly empty in subsequent processing stages, even though the job only reported processing a small first chunk. The job itself logs no errors.

The original author believed that clearing a sublist would only affect that slice, since `subList` is documented as a view. They tested with a single-chunk input and saw correct behavior, so the bug only surfaces when the list is longer than `batchSize`.

## Buggy code

```java
import java.util.ArrayList;
import java.util.List;

public class BatchProcessor {
    private final int batchSize;

    public BatchProcessor(int batchSize) {
        this.batchSize = batchSize;
    }

    public void process(List<WorkItem> items) {
        List<WorkItem> workList = new ArrayList<>(items);

        while (!workList.isEmpty()) {
            int end = Math.min(batchSize, workList.size());
            List<WorkItem> batch = workList.subList(0, end);

            for (WorkItem item : batch) {
                doWork(item);
            }

            // Intended to remove only the processed chunk
            batch.clear();
        }
    }

    private void doWork(WorkItem item) {
        // simulate processing
    }

    interface WorkItem {}
}
```
