---
slug: exception-type-erased-catch-clause
track: java
orderIndex: 79
title: Checked Exception Silently Swallowed
difficulty: easy
tags:
  - exceptions
  - error-handling
language: java
---

## Context

This code lives in `src/main/java/com/example/config/ConfigLoader.java`. It loads application properties from a file at startup. If the file is missing or unreadable, the intent is to throw an `IllegalStateException` so the application fails fast with a clear message rather than starting in a broken state.

## Buggy code

```java
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

public class ConfigLoader {
    public Properties load(String path) {
        Properties props = new Properties();
        try {
            FileInputStream fis = new FileInputStream(path);
            props.load(fis);
            fis.close();
        } catch (IOException | IllegalArgumentException e) {
            System.err.println("Failed to load config: " + e.getMessage());
            throw new IllegalStateException("Config unavailable");
        } catch (Exception e) {
            System.err.println("Unexpected error: " + e.getMessage());
        }
        return props;
    }
}
```
