---
slug: map-put-inside-computeifabsent-recursion
track: java
orderIndex: 31
title: ConcurrentHashMap Recursive computeIfAbsent
difficulty: hard
tags:
  - concurrency
  - collections
  - exceptions
language: java
---

## Context

This class lives in `src/main/java/com/example/graph/DependencyGraph.java` and lazily builds adjacency lists for a dependency graph. When a node is first accessed, `computeIfAbsent` is used to initialise an empty list for it. The mapping function also pre-registers the node's known dependants by calling `put` on the same map, as an optimisation to avoid redundant `computeIfAbsent` calls later.

On Java 8 and some Java 11 builds, calls to `addNode` occasionally return `null` instead of the newly created list, and the list stored in the map is never returned to the caller. On Java 9+, some builds throw `ConcurrentModificationException` or `IllegalStateException` inside `computeIfAbsent` even in single-threaded use.

The team ruled out concurrent access (a single thread populates the graph at startup). The bug appears only when a node has pre-registered dependants, suggesting it is related to the nested map mutation inside the mapping function.

## Buggy code

```java
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class DependencyGraph {
    private final Map<String, List<String>> adjacency = new ConcurrentHashMap<>();

    public List<String> addNode(String node, List<String> knownDependants) {
        return adjacency.computeIfAbsent(node, k -> {
            List<String> deps = new ArrayList<>();
            // Pre-register dependants to avoid repeated computeIfAbsent later
            for (String dep : knownDependants) {
                adjacency.put(dep, new ArrayList<>());
            }
            return deps;
        });
    }

    public List<String> getDependants(String node) {
        return adjacency.getOrDefault(node, List.of());
    }
}
```
