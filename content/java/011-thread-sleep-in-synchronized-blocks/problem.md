---
slug: thread-sleep-in-synchronized-blocks
track: java
orderIndex: 11
title: Thread.sleep Inside Synchronized Block
difficulty: medium
tags:
  - concurrency
  - exceptions
  - performance
language: java
---

## Context

`NotificationDispatcher.java` is a shared service that sends push notifications to a third-party API. When the API signals rate-limiting (HTTP 429), the dispatcher is supposed to back off for a second before retrying. The class is called concurrently from a thread pool of 20 worker threads.

During high-volume notification bursts, the application becomes unresponsive: all 20 worker threads block and throughput drops to zero for 1-2 seconds at a time, far longer than the intended single-thread back-off. Other unrelated operations that use the same `NotificationDispatcher` instance also stall.

Thread dumps taken during the outage show all 20 threads in `TIMED_WAITING` state inside `NotificationDispatcher.send`, each waiting on `Thread.sleep`. The team confirmed the third-party API is healthy and only one thread should need to back off at a time.

## Buggy code

```java
public class NotificationDispatcher {
    private final ApiClient apiClient;

    public NotificationDispatcher(ApiClient apiClient) {
        this.apiClient = apiClient;
    }

    public synchronized void send(Notification notification) {
        boolean sent = false;
        while (!sent) {
            ApiResponse response = apiClient.post(notification);
            if (response.isRateLimited()) {
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            } else {
                sent = true;
            }
        }
    }

    interface Notification {}
    interface ApiResponse {
        boolean isRateLimited();
    }
    interface ApiClient {
        ApiResponse post(Notification n);
    }
}
```
