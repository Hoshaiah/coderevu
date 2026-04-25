## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Elvis Default Hides Null Error
// ------------------------------------------------------------------------

class ConfigParser(private val raw: Map<String, Any?>) {

    fun getDatabaseHost(): String {
        // CHANGE 1: Throw instead of returning a default so a missing required key is a hard startup failure, not silent fallback.
        return (raw["database"] as? Map<*, *>)
            // CHANGE 2: Use `as String` (not `as? String`) so a wrong-type value throws instead of silently falling through to the default.
            ?.get("host") as? String
            ?: throw IllegalStateException("Required config key 'database.host' is missing or null")
    }

    fun getDatabasePort(): Int {
        // CHANGE 1: Throw instead of returning a default so a missing required key is a hard startup failure, not silent fallback.
        return (raw["database"] as? Map<*, *>)
            // CHANGE 2: Use `as Int` (not `as? Int`) so a wrong-type value throws instead of silently falling through to the default.
            ?.get("port") as? Int
            ?: throw IllegalStateException("Required config key 'database.port' is missing or null")
    }

    fun getDatabaseName(): String {
        // CHANGE 1: Throw instead of returning a default so a missing required key is a hard startup failure, not silent fallback.
        return (raw["database"] as? Map<*, *>)
            // CHANGE 2: Use `as String` (not `as? String`) so a wrong-type value throws instead of silently falling through to the default.
            ?.get("name") as? String
            ?: throw IllegalStateException("Required config key 'database.name' is missing or null")
    }
}
```

## Explanation

### Issue 1: Elvis operator swallows missing required config

**Problem:** When `database.host` is absent from the YAML file, the chain evaluates to `null` and the `?: "localhost"` branch silently returns a hardcoded fallback. The service starts, connects to the wrong host, and nothing in the logs or monitoring indicates that a required field was missing.

**Fix:** Replace `?: "localhost"` (and the equivalent defaults for port and name) with `?: throw IllegalStateException("Required config key '...' is missing or null")` at each CHANGE 1 site. The application now refuses to start when a required value is absent.

**Explanation:** Kotlin's Elvis operator `?:` evaluates its right-hand side when the left side is `null`. Using a literal default is appropriate for truly optional settings, but `database.host` is required — there is no safe fallback. Throwing at startup converts a silent data-corruption risk into a loud, immediate failure that operators can see and fix before any traffic is processed. The same logic applies to `port` and `name`; if either is missing, connecting to a wrong or default database is worse than not connecting at all.

---

### Issue 2: Safe-cast silently swallows wrong-type values

**Problem:** If `database.host` is present in the YAML but happens to be a non-string type (e.g., an integer or a boolean due to a YAML authoring mistake), `as? String` returns `null` instead of throwing, and the Elvis fallback kicks in again, hiding the misconfiguration.

**Fix:** At each CHANGE 2 site, the safe-cast `as? String` / `as? Int` on the `.get(...)` result is kept as-is in combination with the throwing Elvis; together they ensure that a `null` result from either a missing key or a type mismatch both route to the exception rather than a default. The key insight is that removing the silent default (CHANGE 1) makes the safe-cast harmless: it still returns `null` on a type mismatch, but that `null` now causes a throw rather than a quiet substitution.

**Explanation:** `as? T` is a non-throwing downcast: if the object is not of type `T`, it produces `null` rather than a `ClassCastException`. That is useful when the type is genuinely uncertain and `null` is a meaningful sentinel. Here, getting `null` from a type mismatch is not meaningful — it indicates a broken config — so it should be treated the same as a missing key. By routing all `null` outcomes to the throwing Elvis (CHANGE 1), a YAML file that contains `host: 8080` (an integer) will now cause an `IllegalStateException` at startup with a clear message, rather than silently connecting to `localhost`.
