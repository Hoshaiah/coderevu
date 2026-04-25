---
slug: resource-leak-on-exception
track: java
orderIndex: 98
title: InputStream is never closed when a parsing exception is thrown mid-read
difficulty: easy
tags:
  - resource-management
  - io
  - exceptions
language: java
---

## Context

This ETL job reads gzip-compressed CSV files from a local staging directory, parses them row-by-row, and inserts records into a database. Under normal operation it runs fine, but when a malformed file appears in the directory (e.g. truncated gzip), file descriptor exhaustion eventually brings the JVM down after processing hundreds of files.

Operators confirmed the staging directory can contain corrupted uploads, so exception paths are exercised regularly in production.

## Buggy code

```java
import java.io.*;
import java.util.zip.GZIPInputStream;
import java.util.List;
import java.util.ArrayList;

public class CsvImporter {

    public List<String[]> readRows(File file) throws IOException {
        FileInputStream fis = new FileInputStream(file);
        GZIPInputStream gzis = new GZIPInputStream(fis);
        BufferedReader reader = new BufferedReader(new InputStreamReader(gzis));

        List<String[]> rows = new ArrayList<>();
        String line;
        while ((line = reader.readLine()) != null) {
            rows.add(line.split(",", -1));
        }
        reader.close();
        return rows;
    }
}
```
