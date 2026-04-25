## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — toArray Wrong Type Silent Cast
// ------------------------------------------------------------------------

import java.util.List;
import java.util.ArrayList;

public class ReportExporter {
    private final CsvWriter csvWriter;

    public ReportExporter(CsvWriter csvWriter) {
        this.csvWriter = csvWriter;
    }

    public void export(List<String[]> rows) {
        // CHANGE 1: Use toArray(T[]) overload with a typed array hint so the returned array is actually String[][] instead of Object[]
        // CHANGE 2: Remove the unchecked cast — the typed toArray overload already returns String[][], so no cast is needed
        String[][] data = rows.toArray(new String[0][]);
        csvWriter.write(data);
    }
}
```

## Explanation

### Issue 1: `toArray()` returns `Object[]`, not `String[][]`

**Problem:** `List.toArray()` (the zero-argument overload) always returns `Object[]` at runtime. Java generics are erased at compile time, so the JVM has no knowledge of `String[]` as the element type when building the array. The application throws `ClassCastException: [Ljava.lang.Object; cannot be cast to [[Ljava.lang.String;` the first time `export` runs.

**Fix:** Replace `rows.toArray()` with `rows.toArray(new String[0][])`. This calls the overload `<T> T[] toArray(T[] a)`, which uses the runtime type of the supplied array argument to allocate and fill a properly typed `String[][]`.

**Explanation:** `ArrayList` (and every `AbstractCollection`) implements `toArray(T[] a)` by calling `Arrays.copyOf` with the component type taken from the passed-in array. Passing `new String[0][]` tells the JVM "the elements are `String[]`", so it creates a `String[][]` under the hood. The zero-length hint is the idiomatic modern form — benchmarks show it performs at least as well as pre-sizing the array. A related pitfall: if you pass `new String[rows.size()][]` the method fills in-place, but if the list shrinks between the size call and the fill (e.g., concurrent modification) you can get trailing nulls; the zero-length form always returns a fresh, correctly sized array.

---

### Issue 2: Unchecked cast silences compiler and masks the real error

**Problem:** Writing `(String[][]) rows.toArray()` compiles without error because the compiler sees a raw `Object[]` being cast to `String[][]` and emits only an unchecked-cast warning (which is easy to overlook or suppress). The cast does nothing at compile time to ensure the array is actually a `String[][]`, so the failure is deferred silently to the point of use at runtime.

**Fix:** Remove the explicit `(String[][])` cast entirely. The reference solution calls `rows.toArray(new String[0][])`, whose return type is already inferred as `String[][]`, so the assignment to `String[][] data` needs no cast.

**Explanation:** Java's cast operator on reference types is a runtime `checkcast` instruction; it does not convert or copy data. If the actual object is an `Object[]`, the checkcast for `String[][]` fails immediately. The dangerous part is that the compiler does not flag this as an unconditional error — it warns but compiles — because the generic type erasure means the compiler cannot prove the cast is always wrong. Removing the cast and relying on the typed `toArray` overload makes the code both correct and free of suppressed warnings, so a future reader cannot accidentally interpret the cast as intentional.
