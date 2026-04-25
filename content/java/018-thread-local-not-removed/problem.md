---
slug: thread-local-not-removed
track: java
orderIndex: 18
title: "ThreadLocal Leak in Thread Pool"
difficulty: hard
tags: ["concurrency", "collections", "resource-management"]
language: java
---

## Context

This code lives in `src/main/java/com/example/context/RequestContext.java`, a utility that stores per-request context (tenant ID, user ID, trace ID) in a `ThreadLocal` so that downstream components can read it without passing parameters. It is used in a servlet filter that sets context at the start of each request and is relied on by logging and auditing components throughout the call stack.

After several days of load, the application starts producing audit log entries and database queries with the wrong tenant ID — context from a previous request leaks into a new one. The problem is intermittent and only affects environments using a thread pool (Tomcat, Jetty), not the development server that spawns a fresh thread per request. Heap dumps show a large number of `RequestContext` objects held alive through `ThreadLocalMap` entries.

## Buggy code

```java
public class RequestContext {
    private static final ThreadLocal<Context> CURRENT =
        new ThreadLocal<>();

    public static void set(Context ctx) {
        CURRENT.set(ctx);
    }

    public static Context get() {
        return CURRENT.get();
    }

    // Called by the servlet filter after the response is committed
    public static void clear() {
        CURRENT.set(null);
    }

    public record Context(String tenantId, String userId, String traceId) {}
}
```
