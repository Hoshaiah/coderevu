---
slug: callable-exception-lost-in-get
track: java
orderIndex: 81
title: ExecutionException Cause Silently Dropped
difficulty: medium
tags:
  - exceptions
  - concurrency
  - correctness
language: java
---

## Context

This image-processing worker lives in `src/main/java/com/example/media/ThumbnailService.java`. It submits a `Callable` to a thread pool and waits for the result. The surrounding HTTP handler catches `IOException` and returns a 500 response with a descriptive error message when thumbnail generation fails.

In production, thumbnail failures sometimes return a generic 500 with no message even though the underlying cause is a well-typed `IOException` from the image library. The HTTP handler's `catch (IOException e)` block is never triggered; instead, a different catch block for `RuntimeException` fires with a confusing message. Operators cannot diagnose the root cause from the logs.

The team verified that the `Callable` itself throws the right exception type. The issue is in how `ThumbnailService.generate` retrieves and rethrows the exception.

## Buggy code

```java
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.io.IOException;

public class ThumbnailService {

    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    public byte[] generate(String imageUrl) throws IOException {
        Callable<byte[]> task = () -> downloadAndResize(imageUrl);
        Future<byte[]> future = pool.submit(task);
        try {
            return future.get();
        } catch (ExecutionException e) {
            throw new RuntimeException("Thumbnail generation failed", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted waiting for thumbnail", e);
        }
    }

    private byte[] downloadAndResize(String url) throws IOException {
        throw new IOException("Connection refused: " + url);
    }
}
```
