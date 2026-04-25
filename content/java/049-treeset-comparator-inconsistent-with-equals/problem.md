---
slug: treeset-comparator-inconsistent-with-equals
track: java
orderIndex: 49
title: TreeSet Comparator Swallows Duplicates
difficulty: medium
tags:
  - collections
  - nulls
  - concurrency
language: java
---

## Context

This snippet is from `src/main/java/com/example/catalog/ProductIndex.java`, which maintains a sorted set of products for the search page. Products are ordered by price ascending; ties should show all products with the same price. The index is rebuilt nightly by an ETL job and read by the serving layer.

Operators report that after the nightly rebuild, the product count in the index is lower than the count in the database. Specifically, whenever two distinct products share the same price, only one of them appears in the index. The discrepancy grows as the catalog adds more same-priced items.

The team verified the ETL reads all rows correctly from the database (full row count matches), so the loss happens during insertion into the index structure, not during the database query.

## Buggy code

```java
import java.util.Comparator;
import java.util.TreeSet;

public class ProductIndex {
    private final TreeSet<Product> index = new TreeSet<>(
        Comparator.comparingDouble(Product::getPrice)
    );

    public void add(Product p) {
        index.add(p);
    }

    public int size() {
        return index.size();
    }

    public TreeSet<Product> getIndex() {
        return index;
    }
}
```
