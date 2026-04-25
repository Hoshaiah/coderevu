---
slug: collections-sort-mutating-unmodifiable
track: java
orderIndex: 42
title: Sorting Unmodifiable List Throws
difficulty: easy
tags:
  - collections
  - exceptions
  - immutability
language: java
---

## Context

This service lives in `src/main/java/com/example/catalog/ProductCatalogService.java` and returns a sorted view of products for display in a storefront UI. Products are fetched from a repository that returns results wrapped in `Collections.unmodifiableList` to prevent callers from accidentally mutating the cached data. The sort is applied before returning to the controller.

In production the endpoint throws `UnsupportedOperationException` on every request since a recent refactor changed the repository to return an unmodifiable list. Before the refactor, the repository returned a plain `ArrayList` and the code worked fine. The stack trace points to `java.util.Collections.sort`.

The developer checked the Javadoc for `Collections.sort` and saw that it accepts a `List`, not specifically a mutable list, so they expected it to work. The restriction only becomes apparent when reading the implementation, which calls `list.set()` internally.

## Buggy code

```java
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class ProductCatalogService {
    private final ProductRepository repository;

    public ProductCatalogService(ProductRepository repository) {
        this.repository = repository;
    }

    public List<Product> getProductsSortedByPrice() {
        List<Product> products = repository.findAll(); // returns unmodifiable list
        Collections.sort(products, Comparator.comparingDouble(Product::getPrice));
        return products;
    }
}
```
