## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Singleton initialised with double-checked locking may return a partially constructed object
// ------------------------------------------------------------------------
public class ReportEngineHolder {

    // CHANGE 1: added `volatile` keyword so that the write to `instance` inside the synchronized block is fully visible to all threads before any thread can observe a non-null reference via the first unsynchronized null-check.
    private static volatile ReportEngineHolder instance;

    private final Map<String, Object> config;

    private ReportEngineHolder() {
        this.config = loadConfig();
    }

    public static ReportEngineHolder getInstance() {
        if (instance == null) {
            synchronized (ReportEngineHolder.class) {
                if (instance == null) {
                    instance = new ReportEngineHolder();
                }
            }
        }
        return instance;
    }

    private Map<String, Object> loadConfig() {
        return new java.util.HashMap<>();
    }

    public Map<String, Object> getConfig() {
        // CHANGE 2: return an unmodifiable view instead of the raw HashMap so callers cannot mutate shared singleton state through the returned reference.
        return java.util.Collections.unmodifiableMap(config);
    }
}
```

## Explanation

### Issue 1: Missing `volatile` on singleton field

**Problem:** Without `volatile`, the JVM and CPU are free to reorder the instructions that make up `instance = new ReportEngineHolder()`. A second thread can observe a non-null `instance` before the constructor body has finished executing, then call `getConfig()` on an object whose `config` field is still `null`. This surfaces as a `NullPointerException` deep inside engine methods, and it reproduces more reliably under high concurrency because more threads race through the first unsynchronized `null` check.

**Fix:** Add the `volatile` keyword to the `instance` field declaration: `private static volatile ReportEngineHolder instance;`. This is the only token changed at the CHANGE 1 site.

**Explanation:** Object construction in Java is not a single atomic operation. The JVM allocates memory, writes a reference to that memory into `instance`, and then runs the constructor — but the compiler and CPU are allowed to reorder the second and third steps. `volatile` inserts a memory barrier that prevents any write inside the synchronized block from being reordered past the write to `instance`. Once a thread outside the synchronized block reads a non-null `instance`, the `volatile` guarantee ensures all writes made before that assignment (including the constructor body) are visible. Without `volatile`, double-checked locking is broken on the Java Memory Model even though the synchronized block protects the writer; the unsynchronized reader has no such protection. A related pitfall: switching from double-checked locking to the initialization-on-demand holder idiom (`private static class Holder { ... }`) avoids needing `volatile` entirely, because class loading is inherently thread-safe.

---

### Issue 2: Mutable internal map exposed via `getConfig()`

**Problem:** `getConfig()` returns the raw `HashMap` that backs the singleton's `config` field. Any caller can call `.put()`, `.clear()`, or `.remove()` on the returned map and silently mutate state shared across every thread in the process. This can cause other threads to read incomplete or corrupted configuration values with no synchronization or warning.

**Fix:** Wrap the return value with `java.util.Collections.unmodifiableMap(config)` at the CHANGE 2 site inside `getConfig()`. The field itself remains a plain `HashMap`; only the view handed to callers is read-only.

**Explanation:** A singleton is meant to be a single shared source of truth. Handing out a direct reference to its internal mutable collection breaks that guarantee because callers can change it without the singleton knowing. `Collections.unmodifiableMap` wraps the map in a decorator that throws `UnsupportedOperationException` on any write attempt, making accidental mutation a loud, immediate failure rather than a silent data corruption. The wrapper adds negligible overhead because it holds only a reference to the original map. If callers legitimately need to build modified copies, they can do so by constructing a new `HashMap` from the unmodifiable view.
