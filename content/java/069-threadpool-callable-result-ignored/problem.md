---
slug: threadpool-callable-result-ignored
track: java
orderIndex: 69
title: Callable Result Never Checked for Null
difficulty: medium
tags:
  - nulls
  - concurrency
  - exceptions
language: java
---

## Context

This class is at `src/main/java/com/example/pricing/PricingEngine.java`. It submits price-calculation tasks to a thread pool and collects results. Each `Callable` fetches pricing data from a remote service and returns a computed price. The engine is called on every checkout page load.

Customers sporadically see a `NullPointerException` on the checkout page, but only when the pricing service is slow. The error rate correlates with the pricing service's p99 latency. Support tickets report a blank price or an application error page instead of a checkout total.

The development team has confirmed the `Callable` implementations never return `null` intentionally. They have added null checks inside the callables themselves and the problem persists. The NPE stack trace points to the line that calls `result.doubleValue()` in `PricingEngine`.

## Buggy code

```java
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;

public class PricingEngine {
    private final ExecutorService executor = Executors.newFixedThreadPool(4);

    public double calculateTotal(List<Callable<Double>> pricingTasks) throws InterruptedException {
        List<Future<Double>> futures = new ArrayList<>();
        for (Callable<Double> task : pricingTasks) {
            futures.add(executor.submit(task));
        }

        double total = 0.0;
        for (Future<Double> future : futures) {
            try {
                Double result = future.get(2, TimeUnit.SECONDS);
                total += result.doubleValue();
            } catch (TimeoutException e) {
                // task took too long, skip it
            } catch (ExecutionException e) {
                // task failed, skip it
            }
        }
        return total;
    }
}
```
