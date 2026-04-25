---
slug: list-sublist-structural-modification
track: java
orderIndex: 46
title: Sublist Invalidated by Parent Modification
difficulty: medium
tags:
  - collections
  - exceptions
  - api-misuse
language: java
---

## Context

`src/main/java/com/acme/batch/ChunkProcessor.java` splits a large list of records into fixed-size chunks and hands each chunk to a processing method. The chunking logic uses `List.subList()` to avoid copying data. This code runs in a single-threaded batch job that processes millions of records nightly.

The job intermittently throws `ConcurrentModificationException` even though there is no multithreading involved. The stack trace points into the `subList` iteration inside `processChunk`. The failure does not happen on every run, and seems correlated with records that trigger the "error path" inside `processChunk`.

The team ruled out actual concurrency — thread dumps confirm only one thread is active. They also verified the exception is not coming from within `processChunk` itself.

## Buggy code

```java
import java.util.ArrayList;
import java.util.List;

public class ChunkProcessor {
    private static final int CHUNK_SIZE = 500;
    private final List<String> records = new ArrayList<>();

    public void addRecord(String r) { records.add(r); }

    public void processAll() {
        int total = records.size();
        for (int i = 0; i < total; i += CHUNK_SIZE) {
            int end = Math.min(i + CHUNK_SIZE, total);
            List<String> chunk = records.subList(i, end);
            processChunk(chunk);
            records.removeIf(r -> r.startsWith("ERROR:"));
        }
    }

    private void processChunk(List<String> chunk) {
        for (String r : chunk) {
            System.out.println("Processing: " + r);
        }
    }
}
```
