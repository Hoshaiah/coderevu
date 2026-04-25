## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Exception Swallowed in Static Initializer
// ------------------------------------------------------------------------

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;

public class AppConfig {
    // CHANGE 2: Added a logger so that fallback events and the root cause are recorded instead of silently swallowed.
    private static final Logger LOGGER = Logger.getLogger(AppConfig.class.getName());

    public static final String BASE_URL;
    public static final int TIMEOUT_MS;

    static {
        String url = "https://default.example.com";
        int timeout = 5000;
        try {
            InputStream is = AppConfig.class.getResourceAsStream("/app.properties");
            // CHANGE 1: Explicit null-check on the InputStream so a missing resource produces a clear message instead of a NullPointerException hidden inside the catch block.
            if (is == null) {
                throw new IOException("/app.properties not found on classpath; using defaults");
            }
            Properties props = new Properties();
            props.load(is);
            url = props.getProperty("base.url", url);
            // CHANGE 3: Catch only IOException (and NumberFormatException separately) instead of bare Exception so that unexpected runtime errors are not accidentally swallowed.
            timeout = Integer.parseInt(props.getProperty("timeout.ms", "5000"));
        } catch (NumberFormatException e) {
            // CHANGE 3: Log the bad value so it is visible in the application log, then continue with the default.
            LOGGER.log(Level.WARNING, "Invalid timeout.ms value in app.properties; using default of " + timeout, e);
        } catch (IOException e) {
            // CHANGE 2: Log at WARNING with the full exception so the root cause is immediately visible in logs.
            LOGGER.log(Level.WARNING, "Could not load app.properties; using hardcoded defaults", e);
        }
        BASE_URL = url;
        TIMEOUT_MS = timeout;
    }
}
```

## Explanation

### Issue 1: Null InputStream Causes Silent NPE

**Problem:** When `/app.properties` is absent from the classpath, `getResourceAsStream()` returns `null`. The code passes that `null` directly to `props.load(is)`, which immediately throws a `NullPointerException`. Because the catch block swallows every exception, the fallback defaults are applied but there is zero indication of what went wrong.

**Fix:** After the `getResourceAsStream()` call, an explicit `if (is == null)` check throws a descriptive `IOException` ("not found on classpath") before `props.load()` is ever called. This converts the opaque `NullPointerException` into a meaningful message that lands in the catch block and gets logged.

**Explanation:** `getResourceAsStream()` returning `null` is not itself an exception — it is a normal return value that means "resource not found". The method contract says nothing about throwing; callers are responsible for the null check. Without it, the `NullPointerException` from `props.load(null)` is the first signal of the missing file, but that signal is immediately eaten. Adding the null check lets the code produce a human-readable message ("not found on classpath") as the cause, which is far easier to diagnose than a stack trace that says `NullPointerException at Properties.load`. A related pitfall: the `InputStream` opened here is never closed; wrapping it in a `try-with-resources` would be the next hardening step.

---

### Issue 2: Exceptions Swallowed Without Logging

**Problem:** The catch block contains only a comment and no logging call. In production, when the resource is missing, the failure is completely silent from the application's perspective. The engineer sees `NoClassDefFoundError` wrapping `ExceptionInInitializerError` from whichever class first touched `AppConfig`, with the real cause buried several frames deep and nothing in the application log.

**Fix:** A `java.util.logging.Logger` field is added (`LOGGER`), and each catch block calls `LOGGER.log(Level.WARNING, "...", e)` passing the caught exception as the third argument so the full stack trace is preserved in the log output.

**Explanation:** Java's standard logging, Log4j, SLF4J, and similar frameworks all preserve the original `Throwable` when you pass it as the last argument to a log call. Without that call, the only record of the failure is whatever the JVM prints to stderr if an uncaught exception reaches the top — and in a static initializer that is wrapped inside `ExceptionInInitializerError`, which is itself wrapped inside `NoClassDefFoundError` on every subsequent access. Logging the exception inside the catch block puts the root cause — "IOException: /app.properties not found on classpath" — in the application log at the exact moment the problem occurs, cutting diagnosis time from 20 minutes to seconds.

---

### Issue 3: Catching Bare Exception Hides Programmer Errors

**Problem:** `catch (Exception e)` intercepts `NumberFormatException` from `Integer.parseInt()` silently. If someone puts a non-numeric value for `timeout.ms` in the properties file, the bad value is silently ignored and the default is used, with no feedback that the configuration is wrong.

**Fix:** The single `catch (Exception e)` is replaced with two separate blocks: `catch (NumberFormatException e)` with a warning log, and `catch (IOException e)` with a warning log. Each block logs the specific problem and the offending exception before continuing with defaults.

**Explanation:** Catching `Exception` is overly broad: it hides `NumberFormatException` (bad data in the file), any future coding mistakes like a wrong method call, and — if someone later changes it to `Throwable` — even `OutOfMemoryError`. Splitting into narrowly typed catch blocks makes the code's intent explicit: "I expect IO failures and I expect possible parse failures; anything else should propagate." A `NumberFormatException` from a misconfigured `timeout.ms` is a deployment error that the team should be warned about; applying the silent default means the application runs with an unintended timeout and nobody knows why.
