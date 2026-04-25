## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — YAML deserialization allows remote code execution via crafted payloads
# ------------------------------------------------------------------------
class ConfigImportJob
  def perform(customer_id, yaml_content)
    # CHANGE 1: Replace YAML.load with YAML.safe_load to restrict deserialization to primitive types only (String, Integer, Array, Hash, etc.) and block arbitrary Ruby object instantiation that enables remote code execution.
    config = YAML.safe_load(yaml_content)

    unless config.is_a?(Hash)
      raise ArgumentError, "Config must be a YAML mapping"
    end

    Customer.find(customer_id).update!(config: config)
  rescue ArgumentError => e
    Rails.logger.error("Config import failed: #{e.message}")
  # CHANGE 2: Rescue StandardError separately so unexpected errors (DB failures, network issues, etc.) are logged with their full details rather than silently swallowed or misreported under ArgumentError.
  rescue StandardError => e
    Rails.logger.error("Unexpected error during config import: #{e.class} - #{e.message}")
    raise
  end
end
```

## Explanation

### Issue 1: Unsafe YAML Deserialization Enables RCE

**Problem:** `YAML.load` in Ruby can instantiate arbitrary Ruby objects, including `Gem::Requirement`, `Exception`, or any class reachable in the process. An attacker uploads a YAML file containing a specially crafted tag like `!ruby/object:Gem::Requirement` with a payload in its fields, and the worker executes arbitrary code when deserializing it — no authentication beyond a valid customer account is needed.

**Fix:** Replace `YAML.load(yaml_content)` with `YAML.safe_load(yaml_content)` on the same line. `safe_load` only permits a safe subset of types (strings, integers, floats, booleans, arrays, and hashes) and raises `Psych::DisallowedClass` if the document references any other Ruby class.

**Explanation:** Ruby's Psych YAML parser supports type tags that tell it which Ruby class to instantiate during parsing. `YAML.load` honors all of them. When a worker calls `YAML.load` on attacker-controlled input, Psych constructs whatever object the tag specifies, including objects whose `initialize` or `[]` methods trigger shell commands or file writes as a side effect. `YAML.safe_load` uses an allowlist of permitted classes and rejects everything else before any object is constructed. A related pitfall: if your legitimate configs need types like `Date` or `Symbol`, pass them explicitly via `YAML.safe_load(yaml_content, permitted_classes: [Date, Symbol])` rather than falling back to `YAML.load`.

---

### Issue 2: Overly Broad Rescue Hides Unexpected Failures

**Problem:** The single `rescue ArgumentError` block catches only one specific exception type. Any other exception — an `ActiveRecord::RecordNotFound` if the customer was deleted, a `PG::ConnectionBad` if the database is unreachable, or a `Psych::SyntaxError` on malformed YAML — bubbles up completely unhandled. With some job frameworks this silently marks the job as succeeded; with others it crashes the worker with no log entry from this code path.

**Fix:** Add a second `rescue StandardError => e` clause after the existing `ArgumentError` rescue. It logs the exception class and message, then re-raises so the job framework can retry or dead-letter the job correctly.

**Explanation:** Ruby's rescue chain is evaluated top-to-bottom; only the first matching clause runs. By adding a `StandardError` rescue after the `ArgumentError` one, unexpected errors are still caught and logged with enough detail (`e.class` and `e.message`) to diagnose them, but the `raise` at the end ensures they propagate rather than being swallowed. Re-raising is important because silent failure means the customer's config is never applied and no alert fires. A related pitfall: rescuing `Exception` instead of `StandardError` would also catch `SignalException` and `NoMemoryError`, which should not be caught by application code.
