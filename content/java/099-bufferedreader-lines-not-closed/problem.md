---
slug: bufferedreader-lines-not-closed
track: java
orderIndex: 99
title: Stream returned by BufferedReader.lines() silently leaks the file handle
difficulty: medium
tags:
  - resource-management
  - streams
  - java8
language: java
---

## Context

A log-analysis CLI tool reads large log files line-by-line using the Stream API introduced in Java 8. The tool processes thousands of files in a single run. After a few hundred files, it crashes with `Too many open files`, even though each call looks self-contained.

The developer assumed the stream would close itself after `collect` consumed all elements.

## Buggy code

```java
import java.io.*;
import java.nio.file.*;
import java.util.List;
import java.util.stream.Collectors;

public class LogAnalyzer {

    public List<String> findErrors(Path logFile) throws IOException {
        BufferedReader reader = Files.newBufferedReader(logFile);
        return reader.lines()
                .filter(line -> line.contains("ERROR"))
                .collect(Collectors.toList());
    }
}
```
