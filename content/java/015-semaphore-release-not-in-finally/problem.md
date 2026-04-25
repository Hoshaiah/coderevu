---
slug: semaphore-release-not-in-finally
track: java
orderIndex: 15
title: Semaphore Permits Never Released
difficulty: medium
tags:
  - concurrency
  - exceptions
  - resource-management
language: java
---

## Context

This class is in `src/main/java/com/example/external/RateLimitedClient.java`. It wraps calls to an external payment API and uses a `Semaphore` to cap in-flight requests at 10 to respect the provider's rate limit. The `call` method acquires a permit, makes the HTTP request, then releases the permit. This pattern is used in a high-throughput order processing service.

## Buggy code

```java
import java.util.concurrent.Semaphore;

public class RateLimitedClient {
    private final Semaphore semaphore = new Semaphore(10);
    private final HttpClient httpClient;

    public RateLimitedClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public String call(String endpoint, String payload) throws Exception {
        semaphore.acquire();
        String response = httpClient.post(endpoint, payload);
        semaphore.release();
        return response;
    }

    interface HttpClient {
        String post(String endpoint, String payload) throws Exception;
    }
}
```
