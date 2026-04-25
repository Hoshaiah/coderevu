## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — gsub Block Ignores Regex Captures
# ------------------------------------------------------------------------

module Formatters
  class TemplateRenderer
    def self.render(template, variables = {})
      # CHANGE 2: capture the full matched placeholder text so the fallback restores it exactly, not a reconstructed version
      template.gsub(/\{\{(\w+)\}\}/) do |match|
        key = $1
        # CHANGE 1: convert the hash to use string keys so both symbol- and string-keyed hashes are handled uniformly
        string_variables = variables.transform_keys(&:to_s)
        string_variables[key] || match
      end
    end
  end
end

# Usage:
variables = { "first_name" => "Alice", "company" => "Acme" }
result = Formatters::TemplateRenderer.render(
  "Hello {{first_name}}, welcome to {{company}}!",
  variables
)
puts result
# => "Hello Alice, welcome to Acme!"

# Now works correctly with symbol keys too:
variables_sym = { first_name: "Alice", company: "Acme" }
result2 = Formatters::TemplateRenderer.render(
  "Hello {{first_name}}!",
  variables_sym
)
puts result2  # => "Hello Alice!"
```

## Explanation

### Issue 1: Symbol vs String Key Mismatch

**Problem:** When the caller passes a hash with symbol keys (e.g. `{ first_name: "Alice" }`), the lookup `variables[key]` returns `nil` because `key` is always a `String` extracted from the regex capture, and `"first_name" != :first_name` in Ruby. The placeholder is never replaced and the raw `{{first_name}}` text appears in the rendered email with no error raised.

**Fix:** Before the lookup, call `variables.transform_keys(&:to_s)` to produce a copy of the hash with all keys converted to strings. The lookup then uses `string_variables[key]`, which succeeds for both string- and symbol-keyed hashes.

**Explanation:** Ruby hashes distinguish keys by object equality and hash value. The symbol `:first_name` and the string `"first_name"` are different objects and never compare equal, so a hash indexed with one cannot be found by the other. `transform_keys(&:to_s)` is a standard, non-destructive way to normalize keys without mutating the caller's hash. The conversion happens inside the block on every match, which is fine for small variable hashes; for very large hashes you could move it outside the `gsub` call with one line. A related pitfall is `HashWithIndifferentAccess` (Rails), which handles this automatically — but that is a Rails-specific type and not available in plain Ruby.

---

### Issue 2: Fallback Reconstructs Placeholder Instead of Restoring It

**Problem:** When a key has no matching variable, the buggy code returns `"{{#{key}}}"`, rebuilding the placeholder from the captured group. This happens to produce the correct text for `\w+` patterns, but it couples the fallback to knowledge of the regex syntax. If the regex is ever changed (e.g. to allow hyphens or spaces), the reconstructed string and the original matched text can diverge silently.

**Fix:** The `gsub` block receives the full matched string as its block argument `match`. Replace `"{{#{key}}}"` with `match`, which returns exactly the original text from the template with no reconstruction.

**Explanation:** Ruby's `String#gsub` passes the entire matched substring as the first block parameter. Using `match` as the fallback is both simpler and more correct: it preserves whatever the regex actually captured verbatim, decoupling the fallback from any assumptions about how the placeholder is formatted. For example, if the regex were later updated to `\{\{\s*(\w+)\s*\}\}` to allow spaces, `match` would still return `"{{ first_name }}"` unchanged, while the reconstructed `"{{#{key}}}"` would silently strip the spaces and produce a different string.
