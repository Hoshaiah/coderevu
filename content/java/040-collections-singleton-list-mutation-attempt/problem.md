---
slug: collections-singleton-list-mutation-attempt
track: java
orderIndex: 40
title: Mutation on Singleton List Throws
difficulty: easy
tags:
  - collections
  - exceptions
  - api-misuse
language: java
---

## Context

`DefaultConfigProvider.java` supplies initial configuration values for a rule engine. When no explicit list of allowed countries is configured, the provider returns a single default entry. Callers are expected to be able to add further entries to the returned list.

In QA, the rule engine setup phase throws `UnsupportedOperationException` for tenants that rely on the default configuration. Tenants with explicitly configured country lists work fine. The stack trace points to the `add` call in `RuleEngineSetup.configureCountries()`.

The developer who wrote `DefaultConfigProvider` remembered that `Collections.singletonList` returns a list and assumed it would behave identically to `ArrayList` for read and write operations.

## Buggy code

```java
import java.util.Collections;
import java.util.List;

public class DefaultConfigProvider {

    // Returns the default list of allowed country codes.
    // Callers may add additional entries.
    public List<String> getAllowedCountries() {
        return Collections.singletonList("US");
    }

    // Simulates what the rule engine setup does with the returned list
    public void exampleCallerUsage() {
        List<String> countries = getAllowedCountries();
        countries.add("CA"); // throws UnsupportedOperationException
        countries.add("MX");
        System.out.println(countries);
    }
}
```
