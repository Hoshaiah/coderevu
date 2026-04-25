## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — InputStream is never closed when a parsing exception is thrown mid-read
// ------------------------------------------------------------------------
import java.io.*;
import java.util.zip.GZIPInputStream;
import java.util.List;
import java.util.ArrayList;

public class CsvImporter {

    public List<String[]> readRows(File file) throws IOException {
        // CHANGE 1 & 2: Wrap all three streams in a single try-with-resources so that
        // reader (and the wrapped streams) are closed on any exit path, including exceptions
        // thrown by GZIPInputStream constructor (CHANGE 2) or readLine() (CHANGE 1).
        FileInputStream fis = new FileInputStream(file);
        // CHANGE 2: Declare gzis inside try-with-resources so that if GZIPInputStream constructor throws, fis is still closed via the outer try-with-resources on fis.
        try (fis; // auto-close fis if GZIPInputStream constructor throws before reader is built
             GZIPInputStream gzis = new GZIPInputStream(fis);
             BufferedReader reader = new BufferedReader(new InputStreamReader(gzis))) {

            List<String[]> rows = new ArrayList<>();
            String line;
            // CHANGE 1: reader.close() was only called on the happy path; now the try-with-resources guarantees close() on every exit, including exceptions.
            while ((line = reader.readLine()) != null) {
                rows.add(line.split(",", -1));
            }
            return rows;
        }
    }
}
```

## Explanation

### Issue 1: Stream not closed on parsing exception

**Problem:** When `reader.readLine()` throws an `IOException` (e.g., because the gzip data is truncated or corrupt), execution jumps straight to the caller without reaching `reader.close()`. The underlying `FileInputStream` keeps its file descriptor open. After enough malformed files are processed this way, the JVM exhausts the OS file descriptor limit and begins throwing errors on every subsequent `new FileInputStream(...)` call.

**Fix:** Replace the explicit `reader.close()` at the end of the method with a `try-with-resources` block that declares `fis`, `gzis`, and `reader`. The `// CHANGE 1` comment marks where `reader.close()` was removed and the `try-with-resources` header was introduced.

**Explanation:** A try-with-resources block calls `close()` on every declared resource in reverse declaration order whenever the block exits — whether normally or via any `Throwable`. The original code relied on reaching the last line of the method, which is skipped when an exception propagates. Because `BufferedReader` wraps `GZIPInputStream` which wraps `FileInputStream`, closing `reader` is enough to chain-close all three under normal conditions, but using try-with-resources on all three makes the intent explicit and handles edge cases where one stream's `close()` itself throws. A related pitfall: if you only wrap `reader` but `GZIPInputStream` constructor throws first, `reader` was never assigned and its close is a no-op, which leads to issue 2.

---

### Issue 2: FileInputStream unclosed if GZIPInputStream constructor throws

**Problem:** `new GZIPInputStream(fis)` reads the gzip magic-number header bytes immediately in its constructor. If the file is so badly corrupt that even this header read fails, the constructor throws before `gzis` is assigned. At that point `fis` exists and holds an open file descriptor, but nothing in the code closes it, so it leaks.

**Fix:** Declare `fis` inside the same `try-with-resources` statement as `gzis` and `reader` (the `// CHANGE 2` site). Java 9+ allows an existing effectively-final variable to appear as a try-with-resources resource, so `fis` is listed first in the resource list and will be closed if the `GZIPInputStream` constructor throws during initialization of the second resource.

**Explanation:** Resource initialization in a try-with-resources statement proceeds left-to-right. If the second resource (`gzis`) throws during construction, the JVM closes all already-successfully-initialized resources — in this case `fis` — before propagating the exception. Without this, `fis` is just a local variable with no cleanup guarantee if the line after it throws. A common oversight is assuming that wrapping only the "outermost" stream is sufficient; it is not when the outer stream's constructor can fail after the inner stream is already open.
