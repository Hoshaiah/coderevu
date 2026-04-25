---
slug: collections-sort-comparator-nulls
track: java
orderIndex: 61
title: Null Guard Missing in Comparator
difficulty: easy
tags:
  - nulls
  - collections
  - sorting
language: java
---

## Context

This utility lives in `src/main/java/com/acme/reports/ReportSorter.java` and is used by a REST endpoint that returns a paginated list of customer reports. Reports can have a nullable `category` field when users leave the dropdown blank during submission.

In production, roughly 3% of sort requests throw a `NullPointerException` deep inside `Collections.sort`, with a stack trace pointing to the lambda comparator. The error surfaces as an HTTP 500 to the client. The QA environment never caught it because test data always had `category` populated.

The team confirmed the NPE is not coming from the list itself being null — logging shows the list is always non-null and non-empty before the sort call.

## Buggy code

```java
import java.util.Collections;
import java.util.List;

public class ReportSorter {

    public void sortByCategory(List<Report> reports) {
        Collections.sort(reports, (a, b) -> a.getCategory().compareTo(b.getCategory()));
    }

    public static class Report {
        private final String title;
        private final String category;

        public Report(String title, String category) {
            this.title = title;
            this.category = category;
        }

        public String getTitle()    { return title; }
        public String getCategory() { return category; }
    }
}
```
