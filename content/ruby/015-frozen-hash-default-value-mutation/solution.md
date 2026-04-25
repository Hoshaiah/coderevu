## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Frozen Config Hash Mutated
# ------------------------------------------------------------------------

# lib/config/defaults.rb
module Config
  HTTP_DEFAULTS = {
    open_timeout: 5,
    read_timeout: 10,
    verify_ssl: true
  }.freeze

  # CHANGE 2: Return a fresh duplicate instead of the frozen constant so callers receive a mutable copy and cannot accidentally corrupt shared state.
  def self.http_options
    HTTP_DEFAULTS.dup
  end
end

# lib/services/payment_client.rb
class PaymentClient
  def initialize
    # CHANGE 1: Config.http_options now returns a dup, so assigning into @options no longer raises FrozenError.
    @options = Config.http_options
    @options[:read_timeout] = Integer(ENV.fetch("PAYMENT_TIMEOUT", 15))
  end

  def post(path, body)
    # ... uses @options
  end
end
```

## Explanation

### Issue 1: Mutation of frozen hash raises FrozenError

**Problem:** `Config.http_options` returns `HTTP_DEFAULTS` directly, which is frozen. The line `@options[:read_timeout] = Integer(ENV.fetch("PAYMENT_TIMEOUT", 15))` tries to write a key into that frozen hash, so Ruby raises `FrozenError: can't modify frozen Hash` on the very first request after boot.

**Fix:** Change `Config.http_options` to return `HTTP_DEFAULTS.dup` instead of `HTTP_DEFAULTS`. The caller in `PaymentClient#initialize` is unchanged — it still assigns into `@options` and mutates `read_timeout` freely.

**Explanation:** Ruby's `.freeze` makes the object itself immutable; any attempt to call a mutating method (`[]=`, `merge!`, `delete`, etc.) on it raises `FrozenError`. Because `http_options` handed back the actual constant object, `@options` and `HTTP_DEFAULTS` were the same object in memory. Calling `.dup` creates a shallow copy with the same key-value pairs but without the frozen flag, so the assignment succeeds. One pitfall with `.dup`: if any values in the hash are themselves frozen objects that you also need to mutate, you would need a deep copy; here all values are integers and a boolean, so a shallow dup is sufficient.

---

### Issue 2: Returning the shared constant exposes global state to all callers

**Problem:** Even before `freeze` was added, returning the raw constant meant any caller that mutated the hash would change the defaults seen by every other caller for the rest of the process lifetime. This is a silent data-corruption bug rather than a crash, so it can be hard to trace.

**Fix:** `Config.http_options` now calls `HTTP_DEFAULTS.dup` so each caller receives its own independent copy. The constant stays frozen and authoritative; callers customise their own copy without touching the shared source.

**Explanation:** A module-level constant is allocated once and lives for the entire Ruby process. If two service objects both call `Config.http_options` and receive the same object, a `merge!` or `[]=` in one changes what the other reads. Returning a `dup` gives each call site an independent hash. The `freeze` on the constant is still valuable: it makes the source-of-truth immutable and causes an immediate, obvious error if someone accidentally calls a mutating method on the constant itself rather than on a copy.
