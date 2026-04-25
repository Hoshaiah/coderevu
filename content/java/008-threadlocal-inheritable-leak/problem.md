---
slug: threadlocal-inheritable-leak
track: java
orderIndex: 8
title: ThreadLocal Leaked Across Request Boundary
difficulty: medium
tags:
  - concurrency
  - exceptions
  - thread-safety
language: java
---

## Context

This request-context holder lives in `src/main/java/com/acme/web/RequestContext.java`. A servlet filter sets a tenant ID at the start of every request and is supposed to clear it at the end. The tenant ID is consumed by DAOs to scope database queries to the correct schema.

In production on a thread-pool-backed servlet container (Tomcat), some queries sporadically run against the wrong tenant's schema. The ops team correlates this with requests that threw an exception — the thread is returned to the pool with the tenant context still set, and the next request processed by that thread inherits it.

The team verified that the filter's `doFilter` is always called — the issue is that the cleanup does not run in the error path.

## Buggy code

```java
import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import java.io.IOException;

public class TenantFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {
        String tenantId = ((HttpServletRequest) request).getHeader("X-Tenant-ID");
        RequestContext.setTenantId(tenantId);
        chain.doFilter(request, response);
        RequestContext.clear();
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
