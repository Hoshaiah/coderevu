## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Null Guard Missing in Comparator
// ------------------------------------------------------------------------

import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class ReportSorter {

    public void sortByCategory(List<Report> reports) {
        // CHANGE 1: Replace direct compareTo with Comparator.nullsLast so null categories don't throw NPE.
        // CHANGE 2: Comparator.nullsLast enforces an explicit policy — nulls sort after all non-null categories.
        Collections.sort(reports,
                Comparator.comparing(Report::getCategory, Comparator.nullsLast(Comparator.naturalOrder())));
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

## Explanation

### Issue 1: NullPointerException on null category

**Problem:** When a report's `category` field is `null`, the lambda `(a, b) -> a.getCategory().compareTo(b.getCategory())` calls `compareTo` on a `null` reference and throws a `NullPointerException`. The caller sees an HTTP 500, and the sort never completes.

**Fix:** Replace the bare lambda with `Comparator.comparing(Report::getCategory, Comparator.nullsLast(Comparator.naturalOrder()))`. `Comparator.nullsLast` wraps the inner comparator and handles `null` values before delegating to `naturalOrder`, so `compareTo` is never called on a `null` string.

**Explanation:** `String.compareTo` is an instance method — calling it on `null` always throws `NullPointerException` at runtime, not compile time. The JDK's `Comparator.nullsLast` (and `nullsFirst`) exist precisely for this case: they check whether either argument is `null` before forwarding to the delegate comparator, so the delegate only ever receives non-null values. The 3% failure rate matches the production rate of blank `category` submissions, confirming this is the root cause. A related pitfall: if you chain `.thenComparing` later, each chained key extractor also needs its own null guard if that field is nullable.

---

### Issue 2: Undefined null sort order

**Problem:** Even if the NPE were suppressed some other way (e.g., returning 0 for nulls), the ordering of null-category reports relative to non-null ones would be arbitrary and could differ between JVM versions or sort algorithm implementations.

**Fix:** `Comparator.nullsLast(Comparator.naturalOrder())` is passed as the second argument to `Comparator.comparing`, explicitly placing all `null` categories at the end of the sorted list after all non-null category strings.

**Explanation:** `Collections.sort` is a stable sort, but stability only preserves the relative order of equal elements — it says nothing about where nulls land. Without an explicit null policy, two developers reading the code have no way to predict or rely on null placement. `Comparator.nullsLast` makes the contract visible in the code itself: any report with a blank category will always appear at the tail of the sorted page. If the product requirement were reversed (nulls first), swapping to `Comparator.nullsFirst` is a one-word change with no risk of NPE either way.
