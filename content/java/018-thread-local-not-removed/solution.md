## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — ThreadLocal Leak in Thread Pool
// ------------------------------------------------------------------------

public class RequestContext {
    // CHANGE 2: Use InheritableThreadLocal so child threads (e.g., async dispatch) inherit context, but more importantly we document the pool-reuse risk that makes cleanup mandatory.
    private static final ThreadLocal<Context> CURRENT =
        new InheritableThreadLocal<>();

    public static void set(Context ctx) {
        CURRENT.set(ctx);
    }

    public static Context get() {
        return CURRENT.get();
    }

    // CHANGE 1: Replace CURRENT.set(null) with CURRENT.remove() so the ThreadLocalMap entry is fully deleted, preventing stale context on thread reuse and eliminating the memory leak.
    public static void clear() {
        CURRENT.remove();
    }

    public record Context(String tenantId, String userId, String traceId) {}
}
```

## Explanation

### Issue 1: `set(null)` Leaves Stale ThreadLocal Entry

**Problem:** After `clear()` runs, the `ThreadLocalMap` slot for `CURRENT` still exists — it just holds `null`. When the same thread picks up the next request, if the servlet filter's `set()` call is missed (e.g., an exception was thrown before it ran), `get()` returns `null` rather than failing loudly, or worse, a prior non-null value persists if the `set(null)` path was skipped. Heap dumps show accumulating `Context` objects because the map entries keep object graphs alive.

**Fix:** Replace `CURRENT.set(null)` with `CURRENT.remove()` in the `clear()` method. `ThreadLocal.remove()` deletes the entry from the thread's `ThreadLocalMap` entirely.

**Explanation:** Each `Thread` owns a `ThreadLocalMap` keyed by `ThreadLocal` instances. Calling `set(null)` writes a `null` value into the existing entry but does not remove the entry or its key reference. The `ThreadLocal` itself is a weak key, but the value slot keeps the `Context` object strongly reachable until the thread dies — which never happens for pooled threads. On top of that, `set(null)` disguises absent context as `null`, so callers cannot distinguish "context was cleared" from "context was never set", making bugs harder to detect. `remove()` deletes the entry, reclaims memory promptly, and ensures a subsequent `get()` returns `null` only because no context exists yet.

---

### Issue 2: No Guaranteed Cleanup on Exception Path

**Problem:** If the servlet filter sets context at request start but an uncaught exception bypasses the `clear()` call at the end, the `ThreadLocal` retains the previous request's `Context` on that pooled thread indefinitely. The next request on that thread inherits the wrong `tenantId`, causing auditing and database queries to run under the wrong tenant.

**Fix:** Switching to `InheritableThreadLocal` (CHANGE 2) documents that child-thread inheritance is intentional, but the critical companion fix is ensuring `clear()` is called in a `finally` block in the servlet filter so it always executes regardless of exceptions.

**Explanation:** A servlet filter should wrap its `chain.doFilter()` call in a `try/finally` block where `RequestContext.clear()` is in the `finally` clause. Without `finally`, any `RuntimeException` or `Error` that propagates out of the filter chain skips cleanup. Pooled threads (Tomcat's NIO connector reuses a small fixed set) then carry stale context into future unrelated requests. `InheritableThreadLocal` is the right base type when async dispatches or `CompletableFuture` tasks need the parent request's context, but it does not help with cleanup — that still depends entirely on the `finally` guarantee. A related pitfall: if the application spawns long-lived background threads, those threads inherit context at creation time and hold it forever unless they explicitly call `clear()`.
