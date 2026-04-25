## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Cache Fetch Ignores Nil Result
# ------------------------------------------------------------------------

class FeatureFlag < ApplicationRecord
  CACHE_TTL = 5.minutes
  # CHANGE 2: Use a thread-local hash instead of a class-level ivar so each thread gets its own cache and concurrent requests cannot stomp on each other.
  SENTINEL = Object.new.freeze

  def self.enabled?(name)
    thread_cache = (Thread.current[:flag_cache] ||= {})
    return thread_cache[name] if thread_cache.key?(name)

    # CHANGE 1: Wrap the block result in a sentinel object so that nil is a storable value, preventing cache.fetch from treating a missing/nil flag as a perpetual cache miss.
    raw = Rails.cache.fetch("feature_flag:#{name}", expires_in: CACHE_TTL) do
      record = find_by(name: name)
      [record&.enabled]
    end

    value = raw.is_a?(Array) ? raw.first : raw
    thread_cache[name] = value
    value
  end

  def self.bust_cache!(name)
    # CHANGE 2: Clear from the thread-local cache instead of the class-level ivar so the bust is scoped to the correct per-thread store.
    Thread.current[:flag_cache]&.delete(name)
    Rails.cache.delete("feature_flag:#{name}")
  end
end
```

## Explanation

### Issue 1: `cache.fetch` Discards Nil Return Values

**Problem:** When a feature flag is deleted from the database or its `enabled` column is `nil`, `Rails.cache.fetch` receives `nil` from the block and treats it as "no value produced" — it skips writing to Redis and returns `nil` to the caller. Every subsequent call re-executes the block and re-queries the database. The in-process `@flag_cache` does store the nil, but only on the first call per process restart; after `bust_cache!` clears that entry, the loop starts again. Users see the flag as active because callers treat `nil` as truthy or fall back to a default-enabled path.

**Fix:** The block now wraps its return value in a single-element Array (`[record&.enabled]`). After `fetch` returns, the code unwraps it with `raw.first`. Because the Array itself is never nil, `cache.fetch` always stores it in Redis. The stored value for a missing flag becomes `[nil]`, which round-trips correctly.

**Explanation:** `Rails.cache.fetch` follows a contract: if the block returns `nil`, Rails (and most cache backends) interpret that as "do not cache". This is documented behavior meant to let callers opt out of caching dynamically. When your domain legitimately produces `nil` as a meaningful value, you have to smuggle it past that check. Wrapping in an Array is a common idiom because `[nil]` is not nil. On the read side, `raw.is_a?(Array)` guards against old cached entries that were stored before this fix was deployed — those come back as plain booleans or nil and pass through unchanged. A related pitfall: using a custom `SENTINEL` object works too, but requires serialization support from the cache store; an Array of a primitive value is safer across store backends.

---

### Issue 2: Class-Level Ivar Shared Across Threads

**Problem:** `@flag_cache` is an instance variable on the `FeatureFlag` class object, which is a singleton shared by every thread in the process. Two concurrent requests can read and write it simultaneously without any synchronization, producing torn reads or one thread seeing another thread's partially written state. More practically, after an admin calls `bust_cache!`, the delete only touches the current thread's reference — other threads still hold the old value in `@flag_cache` and never re-query Redis.

**Fix:** Replace `@flag_cache` with `Thread.current[:flag_cache]`, a thread-local hash. `bust_cache!` is updated to call `Thread.current[:flag_cache]&.delete(name)` instead of `@flag_cache&.delete(name)` so it clears the correct store.

**Explanation:** In Puma (and most multi-threaded Ruby servers), multiple threads share the same class objects but each has its own `Thread.current` storage. Writing to `Thread.current[:flag_cache]` is inherently thread-safe for that thread's own reads and writes. The tradeoff is that `bust_cache!` can only clear the current thread's local cache; other threads will still serve the old value until their per-thread TTL expires or they hit Redis and find the key gone. This is acceptable because Redis is the authoritative cache layer with a 5-minute TTL. If stricter cross-thread invalidation is needed, remove the in-process cache entirely and rely solely on Redis, which is thread-safe by design.
