## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — TreeMap Natural Order Null Key
// ------------------------------------------------------------------------

import java.util.TreeMap;
import java.util.Map;
import java.util.Comparator;

public class ReportCache {
    // CHANGE 1: Use a null-safe comparator so TreeMap accepts null keys without throwing NullPointerException.
    private final Map<String, byte[]> cache = new TreeMap<>(Comparator.nullsFirst(Comparator.naturalOrder()));

    public void store(String reportName, byte[] data) {
        cache.put(reportName, data);
    }

    public byte[] retrieve(String reportName) {
        return cache.get(reportName);
    }

    public void printAllReportNames() {
        for (String name : cache.keySet()) {
            // CHANGE 2: Skip null keys so anonymous reports are not printed as 'Report: null'.
            if (name == null) continue;
            System.out.println("Report: " + name);
        }
    }
}
```

## Explanation

### Issue 1: TreeMap Rejects Null Keys

**Problem:** Any call to `store(null, data)` throws a `NullPointerException` at runtime. `TreeMap` sorts keys using `compareTo`, and when it tries to compare a null key to an existing key it dereferences the null and crashes immediately.

**Fix:** Replace `new TreeMap<>()` with `new TreeMap<>(Comparator.nullsFirst(Comparator.naturalOrder()))`. This custom comparator orders null before all non-null strings, so the map can accept and store null keys safely.

**Explanation:** `TreeMap` uses its comparator (or the key's natural order if none is provided) every time it inserts or looks up a key. The natural order for `String` is `String.compareTo`, which throws `NullPointerException` if either argument is null. By passing `Comparator.nullsFirst(Comparator.naturalOrder())`, you give `TreeMap` a comparator that explicitly handles null on either side of the comparison before delegating to `naturalOrder`. Note that `retrieve(null)` also works correctly after this fix because lookups use the same comparator. If you ever switch to a `HashMap` you get null-key support for free, but you lose the sorted-order guarantee the rest of the code relies on.

---

### Issue 2: Null Key Printed as Literal "null"

**Problem:** After the comparator fix allows null keys to be stored, iterating `cache.keySet()` in `printAllReportNames` yields null as one of the elements. Java's string concatenation turns null into the four-character string `"null"`, so the output line reads `Report: null`, which is meaningless to the end user and could be mistaken for a report actually named "null".

**Fix:** Add `if (name == null) continue;` at the top of the loop body, immediately before the `println` call, so null keys are silently skipped during display.

**Explanation:** The loop variable `name` can be null because `keySet()` faithfully returns all keys including null. Java's `+` operator calls `String.valueOf(name)`, which returns the string `"null"` for a null reference rather than throwing. Skipping the null entry in the display loop matches the stated design intent: null-keyed reports are "anonymous" and do not have a meaningful name to show. If you ever need to surface the count of anonymous reports, you could add a separate counter rather than printing them inline here.
