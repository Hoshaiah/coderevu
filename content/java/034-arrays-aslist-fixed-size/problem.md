---
slug: arrays-aslist-fixed-size
track: java
orderIndex: 34
title: Arrays.asList Returns Fixed-Size List
difficulty: easy
tags:
  - collections
  - exceptions
  - api-misuse
language: java
---

## Context

This code lives in `src/main/java/com/example/config/FeatureFlags.java`, a configuration helper that maintains a list of enabled feature flag names. The list is seeded from a comma-separated environment variable at startup and can be modified at runtime via an admin API that adds or removes flags without restarting the service.

The service starts up fine, but when the admin API tries to add a new feature flag at runtime, it throws `java.lang.UnsupportedOperationException` with no message. The stack trace points to the `add()` call in `enable()`. The team is surprised because the code looks like it produces a normal `List<String>`.

## Buggy code

```java
import java.util.Arrays;
import java.util.List;

public class FeatureFlags {
    private List<String> enabled;

    public FeatureFlags(String csv) {
        String[] parts = csv.split(",");
        enabled = Arrays.asList(parts);
    }

    public void enable(String flag) {
        enabled.add(flag);
    }

    public void disable(String flag) {
        enabled.remove(flag);
    }

    public boolean isEnabled(String flag) {
        return enabled.contains(flag);
    }
}
```
