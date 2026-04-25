---
slug: linkedlist-get-by-index-quadratic
track: java
orderIndex: 45
title: O(n²) LinkedList Index Access
difficulty: medium
tags:
  - collections
  - performance
  - correctness
language: java
---

## Context

This code lives in `src/main/java/com/example/report/ReportRenderer.java`, a report generation service that reads a list of rows from a database result and formats them into a paginated HTML table. The list is built by a JDBC layer that appends rows one by one using `add()`. The rendering loop iterates over all rows by index to apply alternating row styles.

The report endpoint is fast for small datasets (under 1,000 rows) but degrades severely for large exports. A 10,000-row report that should take under a second takes over 30 seconds. A 100,000-row report effectively never completes. Profiling shows nearly all CPU time is spent inside `java.util.LinkedList.get(int)`. The team is confused because iteration looks like a standard indexed loop.

## Buggy code

```java
import java.util.LinkedList;
import java.util.List;

public class ReportRenderer {

    public String render(LinkedList<ReportRow> rows) {
        StringBuilder sb = new StringBuilder();
        sb.append("<table>");
        for (int i = 0; i < rows.size(); i++) {
            ReportRow row = rows.get(i);
            String rowClass = (i % 2 == 0) ? "even" : "odd";
            sb.append("<tr class=\"").append(rowClass).append("\">")
              .append(row.toHtml())
              .append("</tr>");
        }
        sb.append("</table>");
        return sb.toString();
    }
}
```
