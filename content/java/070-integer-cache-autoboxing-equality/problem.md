---
slug: integer-cache-autoboxing-equality
track: java
orderIndex: 70
title: Autoboxed Integer Equality Fails
difficulty: medium
tags:
  - nulls
  - collections
  - correctness
language: java
---

## Context

`InventoryAlertService.java` monitors stock levels and triggers alerts when the current stock count matches a pre-configured threshold. It is a Spring service that runs every minute via `@Scheduled`. Threshold and stock values come from the database as `Integer` objects through JPA.

In QA, alerts reliably fire for common low-stock thresholds like 5 or 10 but never fire for thresholds above 127, even when the stock count exactly matches. Stakeholders have set some product thresholds to 200 or 500 and are not receiving any alerts. No exceptions are thrown; the alert method simply never gets called.

The developer who wrote the check assumed `==` comparison between two `Integer` variables would work the same as comparing two `int` primitives, since they look identical in code.

## Buggy code

```java
public class InventoryAlertService {

    private final ProductRepository productRepository;
    private final AlertSender alertSender;

    public InventoryAlertService(ProductRepository productRepository,
                                  AlertSender alertSender) {
        this.productRepository = productRepository;
        this.alertSender = alertSender;
    }

    public void checkAlerts() {
        for (Product product : productRepository.findAll()) {
            Integer currentStock = product.getStockCount();
            Integer alertThreshold = product.getAlertThreshold();

            if (currentStock == alertThreshold) {
                alertSender.send(product.getId(), currentStock);
            }
        }
    }

    interface Product {
        long getId();
        Integer getStockCount();
        Integer getAlertThreshold();
    }
    interface ProductRepository {
        Iterable<Product> findAll();
    }
    interface AlertSender {
        void send(long productId, int stockCount);
    }
}
```
