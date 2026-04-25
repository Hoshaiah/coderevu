---
slug: regex-catastrophic-backtracking
track: java
orderIndex: 92
title: Regex Pattern Causes Catastrophic Backtracking
difficulty: hard
tags:
  - exceptions
  - concurrency
  - performance
language: java
---

## Context

This validator lives at `src/main/java/com/example/api/InputValidator.java` and is called on every inbound HTTP request to validate that the `description` field of a product submission matches the expected format: words separated by spaces, with optional punctuation. It is called from a Tomcat request-handler thread.

Under normal load the validator is instant. However, the operations team has observed that carefully crafted input (or occasionally malformed user input) causes request threads to hang for minutes. The Tomcat thread pool exhausts its threads, new requests queue up, and the service becomes unavailable. CPU usage spikes to 100% on a single core per hung thread.

The team ruled out a database issue — the validator is called before any DB access. They traced the hang to the `Pattern.matches` call using a profiler.

## Buggy code

```java
import java.util.regex.Pattern;

public class InputValidator {
    // Matches a description: one or more words, spaces, or punctuation
    private static final Pattern DESCRIPTION_PATTERN =
        Pattern.compile("^([a-zA-Z0-9]+ *)*$");

    public boolean isValidDescription(String input) {
        if (input == null || input.length() > 500) {
            return false;
        }
        return DESCRIPTION_PATTERN.matcher(input).matches();
    }
}
```
