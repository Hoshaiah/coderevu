---
slug: future-get-unchecked-exception-lost
track: java
orderIndex: 82
title: ExecutionException Cause Never Unwrapped
difficulty: medium
tags:
  - exceptions
  - concurrency
  - collections
language: java
---

## Context

This code lives in `src/main/java/com/example/export/ReportExporter.java`, which fans out per-region report generation tasks to a fixed thread pool and then collects results. The method is called from a scheduled job that runs every hour and is expected to throw a descriptive exception if any region fails.

On-call engineers observe that when a region's report task throws a `ReportGenerationException`, the scheduled job's error log only shows `java.lang.RuntimeException: Task failed` with no cause chain and no region information. The actual exception from the worker thread is completely invisible in logs, making diagnosis very slow.

The team confirmed the worker tasks do throw `ReportGenerationException` with a detailed message and full stack trace — they verified this by adding logging inside the Callable. The problem is exclusively in how the exception surfaces to the caller.

## Buggy code

```java
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.*;

public class ReportExporter {
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    public void exportAll(List<String> regions) throws ReportGenerationException {
        List<Future<Void>> futures = new ArrayList<>();
        for (String region : regions) {
            futures.add(pool.submit(() -> {
                generateReport(region);
                return null;
            }));
        }
        for (Future<Void> f : futures) {
            try {
                f.get();
            } catch (ExecutionException | InterruptedException e) {
                throw new RuntimeException("Task failed");
            }
        }
    }

    private void generateReport(String region) throws ReportGenerationException {
        // ... report logic ...
    }
}
```
