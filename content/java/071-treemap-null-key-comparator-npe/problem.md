---
slug: treemap-null-key-comparator-npe
track: java
orderIndex: 71
title: TreeMap Natural Order Null Key
difficulty: medium
tags:
  - nulls
  - collections
  - exceptions
language: java
---

## Context

This cache helper lives in `src/main/java/com/example/reporting/ReportCache.java`. It stores report results keyed by a report name string. The `store` method is called from multiple report generators, some of which pass a `null` key when the report name could not be determined (treated as an "anonymous" report). The developers chose `TreeMap` to get reports in sorted order for display.

## Buggy code

```java
import java.util.TreeMap;
import java.util.Map;

public class ReportCache {
    private final Map<String, byte[]> cache = new TreeMap<>();

    public void store(String reportName, byte[] data) {
        cache.put(reportName, data);
    }

    public byte[] retrieve(String reportName) {
        return cache.get(reportName);
    }

    public void printAllReportNames() {
        for (String name : cache.keySet()) {
            System.out.println("Report: " + name);
        }
    }
}
```
