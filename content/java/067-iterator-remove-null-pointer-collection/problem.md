---
slug: iterator-remove-null-pointer-collection
track: java
orderIndex: 67
title: HashMap Values Iterator NPE
difficulty: easy
tags:
  - nulls
  - collections
  - iteration
language: java
---

## Context

This utility lives in `src/main/java/com/example/inventory/StockManager.java`. It manages an in-memory `HashMap<String, Integer>` of product SKUs to available quantities. The `pruneOutOfStock` method is called nightly by a scheduled job to remove entries where quantity is zero or null.

## Buggy code

```java
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class StockManager {
    private final Map<String, Integer> stock = new HashMap<>();

    public void addStock(String sku, Integer quantity) {
        stock.put(sku, quantity);
    }

    public void pruneOutOfStock() {
        Iterator<Map.Entry<String, Integer>> it = stock.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, Integer> entry = it.next();
            if (entry.getValue() == 0) {
                it.remove();
            }
        }
    }

    public int totalUnits() {
        return stock.values().stream().mapToInt(Integer::intValue).sum();
    }
}
```
