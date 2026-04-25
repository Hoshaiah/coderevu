## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Stream returned by BufferedReader.lines() silently leaks the file handle
// ------------------------------------------------------------------------
import java.io.*;
import java.nio.file.*;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class LogAnalyzer {

    public List<String> findErrors(Path logFile) throws IOException {
        // CHANGE 1: Wrap the BufferedReader in a try-with-resources so the file handle is guaranteed to be closed after collect() returns (or throws).
        // CHANGE 2: Capture the Stream in a variable inside the try block so it is also closed, which in turn closes the underlying reader reliably.
        try (BufferedReader reader = Files.newBufferedReader(logFile);
             Stream<String> lines = reader.lines()) {
            return lines
                    .filter(line -> line.contains("ERROR"))
                    .collect(Collectors.toList());
        }
    }
}
```

## Explanation

### Issue 1: File handle never closed after read

**Problem:** Every call to `findErrors` opens a `BufferedReader` but never closes it. After a few hundred calls the OS file-descriptor table fills up and the JVM throws `Too many open files`, crashing the tool mid-run.

**Fix:** Wrap `BufferedReader reader = Files.newBufferedReader(logFile)` in a `try-with-resources` statement (`try (BufferedReader reader = ...)`) so that `reader.close()` is called automatically when the block exits, whether normally or via an exception.

**Explanation:** `BufferedReader` implements `Closeable`, which means the JVM's try-with-resources mechanism calls `close()` on it at the end of the block. Without this, the reference in `reader` goes out of scope but the OS-level file descriptor it wraps stays open until the GC finalizes the object — which may never happen under memory pressure, or happens far too late. In a tool that processes thousands of files sequentially, descriptors accumulate faster than the GC reclaims them. The fix makes the close deterministic and tied directly to the call frame.

---

### Issue 2: Stream.lines() does not auto-close the reader on terminal operation

**Problem:** The developer assumed that calling `collect()` — which exhausts the stream — would also close the `BufferedReader`. It does not. `Stream.lines()` has no such contract; it only closes when the `Stream` itself is closed.

**Fix:** Declare the `Stream<String> lines = reader.lines()` inside the same `try-with-resources` block as the reader. `Stream` implements `AutoCloseable`, so the try block closes both the stream and the reader on exit.

**Explanation:** `BaseStream.close()` triggers any registered close handlers on the stream pipeline. `BufferedReader.lines()` registers a handler that closes the reader, but that handler only fires when `Stream.close()` is explicitly called. Terminal operations like `collect`, `forEach`, and `findFirst` do not call `Stream.close()`. By placing the `Stream` in the try-with-resources alongside the reader, the JVM calls `Stream.close()` at block exit, which in turn calls the reader's close handler. An alternative is `Files.lines(logFile)`, which returns a stream that already wraps the file and can be used in its own try-with-resources, but both approaches require explicit try-with-resources — the stream will not self-close otherwise.
