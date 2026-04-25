## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Tagged events share a hash across calls
# ------------------------------------------------------------------------
class Analytics
  EVENTS = []

  # CHANGE 1: Replace `tags = {}` with `tags = nil` and dup/default inside the method body so each call gets its own fresh hash instead of sharing one object.
  def self.record_event(name, tags = nil)
    # CHANGE 1: Build a new hash from the caller's tags (or empty) so mutations here never affect the caller's object or bleed into other calls.
    # CHANGE 2: Merge into a new hash rather than mutating `tags` in-place, protecting callers who reuse the same hash across multiple record_event calls.
    event_tags = (tags || {}).dup
    event_tags[:recorded_at] = Time.now
    EVENTS << { name: name, tags: event_tags }
  end
end

Analytics.record_event("signup")
Analytics.record_event("checkout")
# Each event now has its own independent tags hash.
```

## Explanation

### Issue 1: Shared default mutable hash argument

**Problem:** When callers omit the `tags` argument, Ruby evaluates `{}` once at method-definition time and reuses that same hash object for every call. Any write to `tags` inside `record_event` — such as adding `:recorded_at` — permanently modifies the shared object, so every subsequent call that uses the default sees the accumulated mutations from all prior calls.

**Fix:** Change the default from `tags = {}` to `tags = nil`, then immediately build a working copy with `(tags || {}).dup` inside the method body. This guarantees a fresh hash for every invocation.

**Explanation:** Ruby default argument expressions for methods are evaluated at parse/load time for immutable literals, but `{}` creates a single Hash instance once. Every call that hits the default gets a reference to that one object. When `record_event` writes `tags[:recorded_at] = Time.now`, it modifies the shared default hash, not a per-call copy. The next call that also uses the default starts with `:recorded_at` already present. Using `nil` as the sentinel and constructing a new hash inside the method body breaks that shared-reference chain entirely. A related pitfall: the same problem appears with mutable defaults in Ruby method signatures using array literals (`def foo(list = [])`), which is a common source of subtle state leakage.

---

### Issue 2: Caller's hash mutated in-place

**Problem:** Even when a caller passes their own explicit hash, `tags[:recorded_at] = Time.now` writes directly into that caller-owned object. If the caller holds a reference to the hash and inspects it later, or passes it to another call, it now unexpectedly contains `:recorded_at`. This makes `record_event` have a hidden side-effect on the caller's data.

**Fix:** Replace the in-place mutation with a write to `event_tags`, a local copy produced by `(tags || {}).dup` before any modifications. The original object passed by the caller is never touched.

**Explanation:** Ruby passes hashes by reference. Assigning `tags[:recorded_at] = Time.now` reaches through that reference and changes the caller's object. If a caller does `my_tags = {user: 1}; Analytics.record_event("signup", my_tags)`, then inspects `my_tags` afterward, they see `{user: 1, recorded_at: ...}` — a value they never added. Calling `dup` creates a shallow copy so the method works on its own hash and the caller's object remains unchanged. Note that `dup` is shallow, so nested objects inside `tags` would still be shared; for deep nesting, `deep_dup` (Rails) or `Marshal` round-tripping would be needed, but for a flat tags hash `dup` is sufficient.
