## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — List.toArray Loses Generic Type
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.List;

public class ReportExporter {

    public void export(List<String> headers, List<List<String>> rows) {
        // CHANGE 1: Use toArray(new String[0]) instead of toArray() so the returned array is actually a String[], not Object[].
        String[] headerArray = headers.toArray(new String[0]);
        LegacyReportApi.writeHeaders(headerArray);

        for (List<String> row : rows) {
            // CHANGE 1: Same fix applied to each row — toArray(new String[0]) returns String[], avoiding ClassCastException.
            String[] rowArray = row.toArray(new String[0]);
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

## Explanation

### Issue 1: `toArray()` Returns `Object[]`, Not `String[]`

**Problem:** Every call to `headers.toArray()` and `row.toArray()` returns an `Object[]`. The subsequent cast `(String[]) ...` compiles without warning but throws `ClassCastException: [Ljava.lang.Object; cannot be cast to [Ljava.lang.String;` at runtime. This happens every time the code runs, not intermittently, because Java's generic type erasure means the JVM has no knowledge of `<String>` at runtime.

**Fix:** Replace both `(String[]) list.toArray()` expressions with `list.toArray(new String[0])`. This uses the overload `<T> T[] toArray(T[] a)` defined on `Collection`, which uses the runtime type of the supplied array to create the result array as a true `String[]`.

**Explanation:** Java generics are erased at compile time. At runtime, a `List<String>` and a `List<Object>` are the same raw `ArrayList`. When you call the no-argument `toArray()`, the `ArrayList` implementation allocates `new Object[size]` internally — it has no type token to do otherwise. Casting that `Object[]` reference to `String[]` fails because array types are covariant but not interchangeable: the JVM checks the actual component type of the array object, not the declared generic type of the list. Passing `new String[0]` to `toArray(T[] a)` gives the implementation a concrete runtime type token; it either fills that array or creates a new one of the same component type (`String`), so the returned reference is genuinely a `String[]` and the cast is unnecessary. Using length `0` is idiomatic and avoids pre-allocating a full-sized array that may be discarded anyway when the list is larger than the hint.

---
