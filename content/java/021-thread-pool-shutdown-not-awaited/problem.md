---
slug: thread-pool-shutdown-not-awaited
track: java
orderIndex: 21
title: Thread Pool Shutdown Without Awaiting Termination
difficulty: hard
tags:
  - concurrency
  - correctness
  - exceptions
language: java
---

## Context

This batch export job lives in `src/main/java/com/example/export/ReportExporter.java`. It fans out report generation across a fixed thread pool and then writes an index file after all reports are ready. The method is called synchronously from a cron-triggered endpoint; the HTTP response is sent only after `exportAll` returns.

Operators notice that the index file is frequently incomplete — it is written before some reports have actually finished generating. Adding timing logs shows that `writeIndex()` is called almost immediately after `pool.shutdown()`, long before worker threads complete. The team assumed `shutdown()` was a blocking call.

The team ruled out race conditions in the individual report writers. The problem is purely in how the main thread waits for the pool to finish.

## Buggy code

```java
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ReportExporter {

    public void exportAll(List<String> reportIds) throws InterruptedException {
        ExecutorService pool = Executors.newFixedThreadPool(8);

        for (String id : reportIds) {
            pool.submit(() -> generateReport(id));
        }

        pool.shutdown();
        writeIndex(reportIds);
    }

    private void generateReport(String reportId) {
        // ... expensive report generation ...
    }

    private void writeIndex(List<String> ids) {
        // ... write index file listing all generated reports ...
    }
}
```
