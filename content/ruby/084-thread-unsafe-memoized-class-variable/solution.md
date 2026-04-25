## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Memoized Class Variable Race
# ------------------------------------------------------------------------

# lib/feature_flags/loader.rb
module FeatureFlags
  class Loader
    # CHANGE 2: Replace @@config (class variable, leaks to subclasses) with a class-level instance variable for correct, contained scope.
    @config = nil
    # CHANGE 1: Add a Mutex to serialise the lazy-initialisation check so only one thread ever calls load_config and all others wait for the result.
    @config_mutex = Mutex.new

    def self.config
      # CHANGE 1: Use Mutex#synchronize around the ||= pattern so the read-check-write is atomic; eliminates the race where two threads both see nil and both call load_config.
      @config_mutex.synchronize { @config ||= load_config }
    end

    def self.enabled?(flag)
      config.fetch(flag.to_s, false)
    end

    private

    def self.load_config
      path = Rails.root.join("config", "feature_flags.yml")
      YAML.safe_load(File.read(path)) || {}
    end
  end
end
```

## Explanation

### Issue 1: Unsynchronized Lazy Initialisation Race

**Problem:** Under concurrent boot traffic, multiple threads call `self.config` at nearly the same instant. Each thread reads `@@config`, sees `nil`, and proceeds to call `load_config`. Some threads write their result to `@@config` while others are still inside `load_config` or mid-assignment. In that window, `config` can return `nil` to a calling thread, so `enabled?` calls `fetch` on `nil` and raises, or the flag hash is momentarily absent, making flags appear disabled.

**Fix:** A `Mutex` instance stored in `@config_mutex` is added, and `self.config` wraps the `||=` expression in `@config_mutex.synchronize { ... }`, making the read-check-write sequence atomic.

**Explanation:** The `||=` operator desugars to `@config = @config || load_config`, which is at least two separate instructions (read, then conditional write). Ruby's GIL does not protect multi-instruction sequences; a thread switch can occur between the read returning `nil` and the write completing. With the mutex, the first thread to acquire it evaluates `@config ||= load_config`, sets `@config`, and releases the lock. Every subsequent thread acquires the lock, reads a non-nil `@config`, and short-circuits without calling `load_config` again. A related pitfall: double-checked locking without a mutex (checking outside and inside the lock) is unsafe in MRI and especially in JRuby or TruffleRuby where true parallelism exists.

---

### Issue 2: Class Variable Scope Leaks to Subclasses

**Problem:** `@@config` is a class variable, which Ruby shares with every subclass of `Loader` and can bleed across re-openings of the class hierarchy. If any other class in the `FeatureFlags` module also defines `@@config`, the two collide silently, potentially caching the wrong hash or resetting the cache to `nil` unexpectedly.

**Fix:** Replace `@@config` and `@@config_mutex` with `@config` and `@config_mutex`, which are class-level instance variables — they belong solely to the `Loader` class object itself and are invisible to subclasses or sibling classes.

**Explanation:** In Ruby, `@@var` is looked up by walking the inheritance chain, so a subclass that writes `@@config` overwrites the parent's copy, and vice versa. `@var` defined in a `def self.method` or at the class body level is an instance variable of the class object `Loader` itself; it is completely private to that object. Because `Loader` is unlikely to be subclassed, the practical risk here is low during normal operation, but the pattern is a well-known source of hard-to-diagnose bugs when the class hierarchy grows, and it costs nothing to use the safer form.
