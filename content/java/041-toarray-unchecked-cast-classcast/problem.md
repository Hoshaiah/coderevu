---
slug: toarray-unchecked-cast-classcast
track: java
orderIndex: 41
title: toArray Wrong Type Silent Cast
difficulty: easy
tags:
  - collections
  - exceptions
  - generics
language: java
---

## Context

This helper lives in `src/main/java/com/example/report/ReportExporter.java` and converts an in-memory list of report rows into an array to pass to a third-party CSV library whose API requires a `String[][]`. The code has been in production for years without issues, but recently the list was refactored from a raw `ArrayList` to a properly typed `List<String[]>`.

After the refactor, the application throws a `ClassCastException` at runtime on the line that assigns the result of `toArray()`. The stack trace mentions `[Ljava.lang.Object;` cannot be cast to `[[Ljava.lang.String;`. The unit tests pass because they use Mockito to stub the CSV writer, so the cast never executes in test.

The developer is confused because the list contains only `String[]` elements; they expect `toArray()` to return a `String[][]`. The mistake is subtle and common when developers conflate the compile-time generic type with the runtime array type.

## Buggy code

```java
import java.util.List;
import java.util.ArrayList;

public class ReportExporter {
    private final CsvWriter csvWriter;

    public ReportExporter(CsvWriter csvWriter) {
        this.csvWriter = csvWriter;
    }

    public void export(List<String[]> rows) {
        // Convert list to array for the CSV library
        String[][] data = (String[][]) rows.toArray();
        csvWriter.write(data);
    }
}
```
