---
slug: hashmap-null-key-npe
track: java
orderIndex: 72
title: getOrDefault Hides Null Value Bug
difficulty: hard
tags:
  - nulls
  - collections
  - correctness
language: java
---

## Context

`src/main/java/com/acme/config/FeatureFlags.java` loads feature-flag values from a database into a `HashMap<String, String>`. Some flags are intentionally stored with a `null` value in the database to mean "not configured", which callers are supposed to interpret as "use the system default". The `getFlag` method is expected to return `null` for both "flag not found" and "flag explicitly set to null".

A new developer added a fallback so that missing keys return a safe default string instead of causing NPEs downstream. After this change, all flags that were explicitly stored as `null` in the database started returning `"disabled"` instead of `null`, silently enabling the wrong behaviour for those flags. No exception is thrown; the bug is entirely a silent correctness failure.

The team added unit tests that check `getFlag("knownNullFlag")` and confirmed it returns `"disabled"` instead of `null`, but they struggled to understand why `getOrDefault` was not honoring the explicitly-stored `null`.

## Buggy code

```java
import java.util.HashMap;
import java.util.Map;

public class FeatureFlags {
    private final Map<String, String> flags = new HashMap<>();

    public void load(Map<String, String> dbValues) {
        flags.putAll(dbValues);
    }

    public String getFlag(String key) {
        return flags.getOrDefault(key, "disabled");
    }

    public boolean isFlagEnabled(String key) {
        String val = getFlag(key);
        return "true".equalsIgnoreCase(val);
    }
}
```
