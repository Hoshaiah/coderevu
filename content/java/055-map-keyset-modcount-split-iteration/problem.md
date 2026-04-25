---
slug: map-keyset-modcount-split-iteration
track: java
orderIndex: 55
title: keySet forEachRemaining Skips Entries
difficulty: hard
tags:
  - collections
  - concurrency
  - correctness
language: java
---

## Context

This exporter lives in `src/main/java/com/example/metrics/MetricsExporter.java`. It converts an in-memory `HashMap<String, Long>` of metric counters into a flat properties-style string for shipment to a monitoring backend. The `export` method is called periodically from a metrics-flush thread. Operators have noticed that the exported string is sometimes missing metrics that were definitely recorded.

## Buggy code

```java
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

public class MetricsExporter {
    private final Map<String, Long> counters = new HashMap<>();

    public synchronized void increment(String metric) {
        counters.merge(metric, 1L, Long::sum);
    }

    public String export() {
        StringBuilder sb = new StringBuilder();
        Iterator<String> keyIt = counters.keySet().iterator();
        while (keyIt.hasNext()) {
            String key = keyIt.next();
            sb.append(key).append('=').append(counters.get(key)).append('\n');
            counters.remove(key);
        }
        return sb.toString();
    }
}
```
