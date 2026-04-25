---
slug: stack-overflow-recursive-equals
track: java
orderIndex: 80
title: Recursive equals Causes Stack Overflow
difficulty: medium
tags:
  - exceptions
  - correctness
  - collections
language: java
---

## Context

`src/main/java/com/acme/catalog/Category.java` models a product category that can have a parent category. The `equals` method was written to support deduplication when categories are stored in a `HashSet`. The class is part of a catalog import pipeline that builds category trees from a CSV file.

During a large catalog import, the JVM throws `StackOverflowError` deep inside `Category.equals`. The stack trace shows hundreds of frames alternating between `Category.equals` and `Objects.equals`. The categories involved are not especially deeply nested — the deepest tree in the dataset is only 12 levels.

Debugging shows that during the import, a bug in the CSV parser occasionally creates a category whose `parent` field is set to the category itself. The developer who wrote `equals` assumed the tree would always be a proper DAG and did not consider cycles.

## Buggy code

```java
import java.util.Objects;

public class Category {
    private final String id;
    private final String name;
    private final Category parent;

    public Category(String id, String name, Category parent) {
        this.id = id;
        this.name = name;
        this.parent = parent;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Category)) return false;
        Category other = (Category) o;
        return Objects.equals(id, other.id)
            && Objects.equals(name, other.name)
            && Objects.equals(parent, other.parent);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name, parent);
    }
}
```
