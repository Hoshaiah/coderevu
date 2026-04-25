---
slug: collections-unmodifiable-still-mutable
track: java
orderIndex: 47
title: Unmodifiable View Wraps Mutable Reference
difficulty: medium
tags:
  - collections
  - correctness
  - nulls
language: java
---

## Context

This configuration holder lives in `src/main/java/com/example/config/FeatureFlags.java`. It is loaded once at startup and then shared read-only across all request-handling threads. The intent is that callers can read the flag map but cannot add or remove keys, enforced by returning an unmodifiable view.

After a deployment, the team observes that feature flags changed mid-request in production — flags that should be immutable for the lifetime of the server process appear with different values at different points in a single request trace. The `Collections.unmodifiableMap` wrapper is in place, so the team is puzzled: callers cannot call `put` on the returned map, yet values change.

Code review shows that another component calls `FeatureFlags.reload()` to hot-reload flags without restarting the server. This was considered safe because the public getter returns an unmodifiable view.

## Buggy code

```java
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class FeatureFlags {

    private Map<String, Boolean> flags = new HashMap<>();
    private Map<String, Boolean> publicView = Collections.unmodifiableMap(flags);

    public FeatureFlags(Map<String, Boolean> initial) {
        flags.putAll(initial);
    }

    /** Hot-reload flags without restarting the server. */
    public void reload(Map<String, Boolean> newFlags) {
        flags = new HashMap<>(newFlags);
    }

    public Map<String, Boolean> getFlags() {
        return publicView;
    }
}
```
