---
slug: blocking-call-in-synchronized-method
track: java
orderIndex: 26
title: Blocking I/O Inside Synchronized Method
difficulty: hard
tags:
  - concurrency
  - exceptions
  - performance
language: java
---

## Context

This class is in `src/main/java/com/acme/inventory/StockService.java`. It manages an in-memory stock level map and, whenever stock changes, publishes an event to a remote message broker. The `synchronized` keyword was added to prevent concurrent stock updates from corrupting the map.

Under moderate load (a few hundred concurrent users), the entire application effectively hangs. Thread dumps show dozens of threads stuck waiting to acquire the lock on `StockService`, while the lock holder is itself blocked waiting for a response from the message broker. Broker latency spikes (even briefly to 200ms) cause a full application stall.

The developer on call increased the broker timeout from 5s to 10s thinking it was a timeout misconfiguration, which made the hangs last longer rather than shorter.

## Buggy code

```java
import java.util.HashMap;
import java.util.Map;

public class StockService {
    private final Map<String, Integer> stock = new HashMap<>();
    private final EventBroker broker;

    public StockService(EventBroker broker) {
        this.broker = broker;
    }

    public synchronized void adjustStock(String sku, int delta) throws Exception {
        int current = stock.getOrDefault(sku, 0);
        int updated = current + delta;
        if (updated < 0) {
            throw new IllegalArgumentException("Stock cannot go negative for " + sku);
        }
        stock.put(sku, updated);
        // Publish event to remote broker while holding the lock.
        broker.publish("stock.updated", sku + ":" + updated);
    }

    public synchronized int getStock(String sku) {
        return stock.getOrDefault(sku, 0);
    }

    interface EventBroker {
        void publish(String topic, String message) throws Exception;
    }
}
```
