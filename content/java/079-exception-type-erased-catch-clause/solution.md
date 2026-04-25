## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Checked Exception Silently Swallowed
// ------------------------------------------------------------------------

import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

public class ConfigLoader {
    public Properties load(String path) {
        Properties props = new Properties();
        // CHANGE 2: use try-with-resources so fis is closed even when props.load() throws
        try (FileInputStream fis = new FileInputStream(path)) {
            props.load(fis);
        } catch (IOException | IllegalArgumentException e) {
            System.err.println("Failed to load config: " + e.getMessage());
            throw new IllegalStateException("Config unavailable");
        // CHANGE 1: re-throw unexpected exceptions wrapped in IllegalStateException instead of swallowing them silently
        } catch (Exception e) {
            System.err.println("Unexpected error: " + e.getMessage());
            throw new IllegalStateException("Config unavailable due to unexpected error", e);
        }
        return props;
    }
}
```

## Explanation

### Issue 1: Silent Swallow of Unexpected Exceptions

**Problem:** When any `Exception` other than `IOException` or `IllegalArgumentException` is thrown inside the `try` block, the catch-all handler prints a message and then lets the method return an empty `Properties` object. The caller has no idea anything went wrong, and the application starts in a broken state with no configuration loaded.

**Fix:** Add `throw new IllegalStateException("Config unavailable due to unexpected error", e)` at the end of the `catch (Exception e)` block (the `// CHANGE 1` site), so the method never silently returns on failure, and the original exception is preserved as the cause.

**Explanation:** The original catch block handled the logging but then fell through to `return props`, which by that point holds zero entries. Any code that later calls `props.getProperty("key")` gets `null` and may fail in a confusing, distant location rather than at startup. Wrapping and re-throwing means the JVM unwinds immediately with a clear stack trace rooted at the config load. Preserving the original exception as the cause (second argument to `IllegalStateException`) keeps the full diagnostic chain intact so you can see what actually went wrong, not just that config loading failed.

---

### Issue 2: FileInputStream Not Closed on Exception

**Problem:** `fis.close()` sits at the end of the `try` block, so it is only called when both `new FileInputStream(path)` and `props.load(fis)` succeed. If `props.load(fis)` throws, the stream is left open. Under heavy restart cycling or in environments with low file-descriptor limits, this leaks descriptors until the process runs out.

**Fix:** Replace the manual `FileInputStream fis = new FileInputStream(path)` declaration and the explicit `fis.close()` call with a try-with-resources declaration `try (FileInputStream fis = new FileInputStream(path))` at the `// CHANGE 2` site. The compiler inserts a `finally` block that calls `close()` on every exit path.

**Explanation:** Java's try-with-resources statement (introduced in Java 7) guarantees that any `AutoCloseable` declared in the resource list is closed when the `try` block exits, whether normally or via an exception. The manual pattern `fis.close()` inside the `try` body is fragile: any exception thrown before that line is reached skips the close. A related pitfall is that even if you moved `fis.close()` to a `finally` block manually, you would need to handle the case where `close()` itself throws, which try-with-resources handles by suppressing the secondary exception rather than discarding the original one.
