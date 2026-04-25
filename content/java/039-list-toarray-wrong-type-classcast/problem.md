---
slug: list-toarray-wrong-type-classcast
track: java
orderIndex: 39
title: List.toArray Loses Generic Type
difficulty: easy
tags:
  - collections
  - exceptions
  - generics
language: java
---

## Context

This method is part of `src/main/java/com/example/export/ReportExporter.java`, a component that collects report rows into a list and then passes them to a legacy API that requires a `String[]`. The class is straightforward and has been working in a test environment without issues.

In production, the method throws `ClassCastException: [Ljava.lang.Object; cannot be cast to [Ljava.lang.String;` on the line that calls the downstream API. The exception appears consistently, not intermittently. Developers are confused because the list is clearly a `List<String>` and they expect `toArray()` to produce a `String[]`.

The team has confirmed there are no null entries in the list and that the downstream API signature truly requires `String[]`, not `Object[]`.

## Buggy code

```java
import java.util.ArrayList;
import java.util.List;

public class ReportExporter {

    public void export(List<String> headers, List<List<String>> rows) {
        String[] headerArray = (String[]) headers.toArray();
        LegacyReportApi.writeHeaders(headerArray);

        for (List<String> row : rows) {
            String[] rowArray = (String[]) row.toArray();
            LegacyReportApi.writeRow(rowArray);
        }
    }

    // Stub so the snippet compiles standalone
    static class LegacyReportApi {
        static void writeHeaders(String[] h) {}
        static void writeRow(String[] r) {}
    }
}
```
