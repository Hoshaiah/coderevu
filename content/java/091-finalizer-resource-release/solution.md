## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Resource Released Only in Finalizer
// ------------------------------------------------------------------------

import java.lang.ref.Cleaner;

public class NativeFileHandle implements AutoCloseable { // CHANGE 3: implement AutoCloseable so callers can use try-with-resources for deterministic cleanup
    private static final Cleaner CLEANER = Cleaner.create(); // CHANGE 1: use Cleaner instead of finalize() — Cleaner runs on its own thread promptly after the object becomes phantom-reachable, without the GC-scheduling lag of finalizers

    private long nativeHandle;
    private boolean closed = false;
    private final Cleaner.Cleanable cleanable;

    public NativeFileHandle(String path) {
        this.nativeHandle = nativeOpen(path);
        // CHANGE 1: register a cleaning action using a static lambda (no reference to 'this') so the Cleaner can reclaim the handle as soon as the object is unreachable
        long handle = this.nativeHandle;
        this.cleanable = CLEANER.register(this, () -> nativeCloseStatic(handle));
    }

    public byte[] read(int length) {
        if (closed) throw new IllegalStateException("Handle is closed");
        return nativeRead(nativeHandle, length);
    }

    @Override // CHANGE 3: @Override from AutoCloseable; callers can now write try (NativeFileHandle h = new NativeFileHandle(path)) { ... }
    public void close() {
        if (!closed) {
            closed = true;
            cleanable.clean(); // CHANGE 1: delegate to cleanable.clean() which calls nativeCloseStatic exactly once and deregisters the cleaning action, preventing double-close
        }
    }

    // CHANGE 2: removed finalize() entirely — it is deprecated since Java 9, error-prone, and replaced by the Cleaner; also avoids the missing super.finalize() bug

    private native long nativeOpen(String path);
    private native byte[] nativeRead(long handle, int length);
    private native void nativeClose(long handle);

    // CHANGE 1: static native proxy used by the Cleaner lambda so the lambda holds no reference to the NativeFileHandle instance, allowing GC to collect it
    private static native void nativeCloseStatic(long handle);
}
```

## Explanation

### Issue 1: Finalizer-Based Cleanup Starves Native Handle Pool

**Problem:** The service opens thousands of `NativeFileHandle` objects per minute. Each one holds a native file descriptor. When callers do not call `close()`, the only release path is `finalize()`. Finalizers run only during GC, and because heap pressure is low, GC happens infrequently. Native descriptors accumulate faster than they are released, eventually exhausting the OS limit of 65 536 and causing every subsequent `nativeOpen` to fail with `Too many open files`.

**Fix:** Replace `finalize()` and its direct `nativeClose` call with a `Cleaner` registered in the constructor. `close()` now calls `cleanable.clean()`, which invokes `nativeCloseStatic(handle)` exactly once. The `Cleaner` also fires that same action when the object becomes phantom-reachable, acting as a true safety net without depending on GC scheduling.

**Explanation:** `java.lang.ref.Cleaner` (added in Java 9) uses a dedicated daemon thread and `PhantomReference` queue. Once a `NativeFileHandle` is unreachable, the JVM enqueues its phantom reference promptly — without waiting for a full GC cycle. The cleaning action is a plain lambda that captures only the primitive `long handle`, not `this`, so the lambda itself does not prevent the object from becoming unreachable. `cleanable.clean()` is idempotent: it runs the action at most once whether called explicitly from `close()` or by the Cleaner thread. This means an explicit `close()` deregisters the safety-net action immediately, avoiding any redundant work. One pitfall to watch: if the cleaning lambda captured `this` instead of a local copy of `handle`, the `NativeFileHandle` would never become phantom-reachable and the Cleaner would never fire — always capture only primitive or standalone values in the lambda.

---

### Issue 2: finalize() Omits super.finalize() Call

**Problem:** The `finalize()` override never calls `super.finalize()`. If `NativeFileHandle` is ever subclassed, or if a future JVM or instrumentation layer attaches logic to `Object.finalize()`, that logic is silently skipped. The symptom is subtle: the superclass finalizer's work is dropped with no error or warning.

**Fix:** `finalize()` is removed entirely at the CHANGE 2 site. Because the Cleaner now handles cleanup, there is no longer any reason to keep a `finalize()` method, which eliminates the missing `super.finalize()` problem at its root.

**Explanation:** The Java specification requires that an overriding `finalize()` call `super.finalize()`, typically in a `finally` block, so that the chain of finalizers up to `Object` runs correctly. Failing to do so is a latent bug: it has no immediate symptom in a simple single-inheritance hierarchy, but breaks when the class hierarchy deepens or when frameworks inspect the finalizer chain. Removing `finalize()` entirely is the right answer here because the Cleaner already provides a safer, more timely mechanism. `finalize()` has been deprecated since Java 9 and is scheduled for removal, so keeping it alongside a Cleaner would be redundant and confusing.

---

### Issue 3: Class Does Not Implement AutoCloseable

**Problem:** Because `NativeFileHandle` does not implement `AutoCloseable`, callers cannot use try-with-resources. They must remember to call `close()` manually in a `finally` block. In a high-volume service, developers routinely skip this, leaving handles open for the duration of the finalizer queue backup.

**Fix:** `NativeFileHandle` is declared as `implements AutoCloseable` and `close()` gains the `@Override` annotation. Callers can now write `try (NativeFileHandle h = new NativeFileHandle(path)) { ... }` and the compiler enforces that `close()` is called when the block exits, whether normally or via exception.

**Explanation:** `AutoCloseable` is the standard Java contract for deterministic resource release. The try-with-resources statement, introduced in Java 7, calls `close()` in a compiler-generated `finally` block, so the handle is released immediately when the scope ends rather than at some future GC cycle. This is the primary fix for callers who currently forget `close()`; the Cleaner is now a genuine last-resort safety net for edge cases like an unexpected exception before the try block is entered, not a substitute for explicit cleanup. Making `close()` idempotent (guarded by the `closed` flag and `cleanable.clean()`'s own idempotency) means double-close from any combination of try-with-resources and the Cleaner is safe.
