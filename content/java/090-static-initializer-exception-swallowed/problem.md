---
slug: static-initializer-exception-swallowed
track: java
orderIndex: 90
title: "Exception Swallowed in Static Initializer"
difficulty: medium
tags: ["exceptions", "nulls", "error-handling"]
language: java
---

## Context

This class lives in `src/main/java/com/example/config/AppConfig.java` and loads configuration from a properties file on the classpath at class-load time using a static initialiser block. A constant `BASE_URL` is used throughout the application; if loading fails, the intent is to fall back to a hardcoded default. The class is referenced at startup by the main application context.

In production, after a deployment where the properties file was accidentally omitted from the JAR, every call into any class that references `AppConfig` throws `NoClassDefFoundError` with an obscure message mentioning `ExceptionInInitializerError`. The actual root cause — that `BASE_URL` was never set — is buried several exception levels deep and takes the on-call engineer 20 minutes to find.

Local debugging with the properties file present works perfectly. The team suspects the fallback logic is correct but the exception handling in the static block is interfering with the JVM's class-loading mechanism in an unexpected way.

## Buggy code

```java
import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

public class AppConfig {
    public static final String BASE_URL;
    public static final int TIMEOUT_MS;

    static {
        String url = "https://default.example.com";
        int timeout = 5000;
        try {
            InputStream is = AppConfig.class.getResourceAsStream("/app.properties");
            Properties props = new Properties();
            props.load(is);
            url = props.getProperty("base.url", url);
            timeout = Integer.parseInt(props.getProperty("timeout.ms", "5000"));
        } catch (Exception e) {
            // Fall back to defaults silently
        }
        BASE_URL = url;
        TIMEOUT_MS = timeout;
    }
}
```
