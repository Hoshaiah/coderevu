---
slug: wait-outside-synchronized
track: java
orderIndex: 20
title: wait Called Without Holding Monitor
difficulty: hard
tags:
  - concurrency
  - exceptions
  - correctness
language: java
---

## Context

`src/main/java/com/acme/pipeline/DataLatch.java` is a one-shot synchronisation primitive used to make consumer threads wait until a data payload is ready. A producer thread calls `publish()` to store the payload and wake consumers. Consumer threads call `await()` to block until the payload is available. This is used in a request-coalescing layer where many threads wait for a single outbound fetch to complete.

Under load, consumer threads intermittently throw `IllegalMonitorStateException` with the message "current thread is not owner". The stack trace points to the `wait()` call inside `await()`. The exception is not always reproducible and seems to require multiple consumer threads to be racing to call `await()` simultaneously.

The developer confirmed that `notifyAll()` is called inside a `synchronized` block in `publish()`, so they assumed the rest of the class was correct. They also checked that `payload` is declared `volatile`, which they thought was sufficient for visibility.

## Buggy code

```java
public class DataLatch {
    private volatile Object payload;
    private final Object lock = new Object();

    public void publish(Object data) {
        synchronized (lock) {
            this.payload = data;
            lock.notifyAll();
        }
    }

    public Object await() throws InterruptedException {
        while (payload == null) {
            lock.wait();
        }
        return payload;
    }
}
```
