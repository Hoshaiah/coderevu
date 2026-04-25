---
slug: lock-not-released-on-exception
track: java
orderIndex: 9
title: Lock Never Released After Exception
difficulty: medium
tags:
  - concurrency
  - exceptions
  - resource-management
language: java
---

## Context

This class is in `src/main/java/com/example/inventory/InventoryService.java` and manages stock updates in a multi-threaded order processing system. A `ReentrantLock` is used instead of `synchronized` to allow timed lock attempts elsewhere in the codebase. The service processes hundreds of orders per minute under normal load.

After a bad database deployment introduced transient `SQLException`s for about two minutes, the entire order processing pipeline froze. No orders were processed even after the database was restored. Thread dumps showed all worker threads waiting to acquire the lock in `updateStock`, which was never released. The service had to be restarted to recover.

The database issue itself was fixed separately. The team wants to ensure that a future transient exception cannot permanently deadlock the service.

## Buggy code

```java
import java.util.concurrent.locks.ReentrantLock;

public class InventoryService {
    private final ReentrantLock lock = new ReentrantLock();
    private int stock;

    public InventoryService(int initialStock) {
        this.stock = initialStock;
    }

    public boolean updateStock(int delta) {
        lock.lock();
        try {
            int newStock = stock + delta;
            if (newStock < 0) {
                return false;
            }
            persistToDatabase(newStock); // may throw RuntimeException
            stock = newStock;
            return true;
        } catch (RuntimeException e) {
            throw e;
        } finally {
            // unlock is only reached on normal return
        }
        // lock.unlock() is missing here
    }

    private void persistToDatabase(int value) {
        // Simulates a flaky DB call
        if (Math.random() < 0.01) throw new RuntimeException("DB error");
    }
}
```
