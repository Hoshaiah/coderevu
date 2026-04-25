---
slug: thread-pool-starvation-callerrunspolicy
track: java
orderIndex: 2
title: CallerRunsPolicy causes HTTP request threads to block on slow background tasks
difficulty: medium
tags:
  - concurrency
  - thread-pool
  - performance
language: java
---

## Context

A Spring Boot service submits image-resizing tasks to a bounded `ThreadPoolExecutor` so they run asynchronously in the background. Under moderate load the service handles requests quickly, but during traffic spikes users report that the `/upload` endpoint becomes unresponsive for several seconds at a time.

The team added the `CallerRunsPolicy` with good intentions — to avoid dropping tasks — but the policy's interaction with the web server thread pool was not considered.

## Buggy code

```java
import java.util.concurrent.*;

public class ImageResizeService {

    private final Executor executor = new ThreadPoolExecutor(
            4, 4,
            0L, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(10),
            new ThreadPoolExecutor.CallerRunsPolicy()
    );

    public void resizeAsync(byte[] imageData, String targetPath) {
        executor.execute(() -> {
            resize(imageData, targetPath);
        });
    }

    private void resize(byte[] imageData, String targetPath) {
        // CPU-intensive resizing — takes ~500ms
    }
}
```
