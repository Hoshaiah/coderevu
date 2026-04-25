---
slug: nullable-elvis-throws
track: kotlin
orderIndex: 44
title: Elvis Default Hides Null Error
difficulty: easy
tags:
  - nullability
  - error-handling
  - correctness
language: kotlin
---

## Context

`parser/ConfigParser.kt` reads a YAML configuration file and extracts database connection parameters. It uses Kotlin's null-safe operators throughout to avoid null pointer crashes, which the author considered a safety improvement over the previous Java version.

In production, the app occasionally connects to the wrong database. Operators report that after a misconfigured deployment (where `database.host` was accidentally omitted from the config file), the service silently connected to `localhost` instead of refusing to start. This caused data corruption because `localhost` pointed to a developer's test database in the staging network.

No exception was thrown and no log line indicated a missing config value. The monitoring alert for "missing required config" never fired.

## Buggy code

```kotlin
class ConfigParser(private val raw: Map<String, Any?>) {

    fun getDatabaseHost(): String {
        return (raw["database"] as? Map<*, *>)
            ?.get("host") as? String
            ?: "localhost"
    }

    fun getDatabasePort(): Int {
        return (raw["database"] as? Map<*, *>)
            ?.get("port") as? Int
            ?: 5432
    }

    fun getDatabaseName(): String {
        return (raw["database"] as? Map<*, *>)
            ?.get("name") as? String
            ?: "mydb"
    }
}
```
