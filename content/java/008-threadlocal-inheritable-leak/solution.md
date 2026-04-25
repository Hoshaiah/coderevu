## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — ThreadLocal Leaked Across Request Boundary
// ------------------------------------------------------------------------

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import java.io.IOException;

public class TenantFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {
        String tenantId = ((HttpServletRequest) request).getHeader("X-Tenant-ID");
        // CHANGE 2: Guard against a missing header so TENANT is never set to null; skip set entirely if header is absent.
        if (tenantId != null && !tenantId.isEmpty()) {
            RequestContext.setTenantId(tenantId);
        }
        // CHANGE 1: Wrap chain.doFilter in try/finally so RequestContext.clear() runs even when an exception is thrown.
        try {
            chain.doFilter(request, response);
        } finally {
            RequestContext.clear();
        }
    }

    @Override public void init(FilterConfig cfg) {}
    @Override public void destroy() {}
}

class RequestContext {
    private static final ThreadLocal<String> TENANT = new ThreadLocal<>();
    public static void setTenantId(String id) { TENANT.set(id); }
    public static String getTenantId()         { return TENANT.get(); }
    public static void clear()                 { TENANT.remove(); }
}
```

## Explanation

### Issue 1: ThreadLocal Not Cleared on Exception

**Problem:** When `chain.doFilter()` throws an `IOException` or `ServletException`, execution jumps out of `doFilter` before `RequestContext.clear()` is reached. The `ThreadLocal` entry stays on the thread. Tomcat returns that thread to its pool, and the next request processed by that thread reads the previous tenant's ID from `RequestContext.getTenantId()`, routing its DAO queries to the wrong schema.

**Fix:** Wrap the `chain.doFilter(request, response)` call in a `try` block and move `RequestContext.clear()` into a `finally` block (see `CHANGE 1`). The `finally` block executes regardless of whether the call completes normally or throws.

**Explanation:** Java `finally` blocks run after both normal returns and thrown exceptions before the stack unwinds further. Without it, any exception thrown inside the filter chain — including a runtime exception from a DAO or a servlet — bypasses the cleanup line entirely. Because thread-pool threads are reused across many requests, the stale `ThreadLocal` value persists until a future request on the same thread happens to overwrite it. The `finally` block is the standard idiom for this kind of thread-local lifecycle management; it mirrors how `Lock.unlock()` is always placed in `finally`.

---

### Issue 2: Null Header Silently Written to ThreadLocal

**Problem:** If a request arrives without an `X-Tenant-ID` header, `getHeader()` returns `null`. The original code calls `RequestContext.setTenantId(null)`, storing `null` in the `ThreadLocal`. Any downstream code that calls `RequestContext.getTenantId()` and passes the result directly into a string operation — such as building a JDBC schema name — will throw a `NullPointerException`.

**Fix:** Add a null-and-empty check before calling `setTenantId` (see `CHANGE 2`). If the header is absent or blank, `setTenantId` is skipped entirely, leaving the `ThreadLocal` unset for that request.

**Explanation:** `HttpServletRequest.getHeader()` returns `null` when the named header is not present, not an empty string. Storing `null` through `ThreadLocal.set(null)` is technically legal but behaves differently from `ThreadLocal.remove()`: `get()` returns `null` rather than the initialValue. Code that does `"schema_" + RequestContext.getTenantId()` will produce the string `"schema_null"`, which is a hard-to-spot data bug on top of the potential NPE. Skipping `setTenantId` when the header is missing means `getTenantId()` returns `null` (or whatever `initialValue` provides), making the absence of a tenant explicit and consistent. A related pitfall: if you later add a default `initialValue` to the `ThreadLocal`, the guard ensures the default is not accidentally overwritten by a blank header.
