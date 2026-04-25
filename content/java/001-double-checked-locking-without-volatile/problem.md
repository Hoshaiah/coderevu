---
slug: double-checked-locking-without-volatile
track: java
orderIndex: 1
title: >-
  Singleton initialised with double-checked locking may return a partially
  constructed object
difficulty: medium
tags:
  - concurrency
  - jmm
  - singleton
language: java
---

## Context

A background analytics service creates a single shared `ReportEngine` on first use. The team added double-checked locking to avoid the cost of synchronisation on every call. Load tests pass, but in production on multi-core machines the service occasionally throws a `NullPointerException` deep inside `ReportEngine` methods, as if the object was not fully initialised when another thread first used it.

The bug reproduces more reliably under high concurrency and on machines with more cores.

## Buggy code

```java
public class ReportEngineHolder {

    private static ReportEngineHolder instance;

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
        return config;
    }
}
```
