## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Map Bang Mutates Original Array
# ------------------------------------------------------------------------

class ReportFormatter
  def initialize(tags)
    @tags = tags
  end

  def normalize_tags
    # CHANGE 1: Replace `map!` with `map` so `@tags` is not mutated; a new array is returned instead of modifying the receiver in place.
    @tags.map(&:downcase)
  end

  def has_uppercase_tags?
    @tags.any? { |t| t =~ /[A-Z]/ }
  end
end

formatter = ReportFormatter.new(["Events", "Sales", "HR"])
puts formatter.has_uppercase_tags?   # => true
# CHANGE 2: Capture the return value rather than relying on side-effects; normalize_tags now returns a new array and callers must store it if they need it.
normalized = formatter.normalize_tags
puts formatter.has_uppercase_tags?   # => true (original @tags is unchanged)
puts normalized.inspect              # => ["events", "sales", "hr"]
```

## Explanation

### Issue 1: `map!` Permanently Mutates `@tags`

**Problem:** After `normalize_tags` is called once, every element in `@tags` is downcased in place. Subsequent calls to `has_uppercase_tags?` always return `false`, even for tags that were originally mixed-case, because `@tags` no longer contains the original strings.

**Fix:** Replace `@tags.map!(&:downcase)` with `@tags.map(&:downcase)` on the same line. `map` returns a new array and leaves `@tags` untouched.

**Explanation:** `map!` is the destructive variant of `map`; it iterates over the array and replaces each element with the block's return value in the same memory location. Because `@tags` is a reference to the same array object throughout the object's lifetime, every method that reads `@tags` after `normalize_tags` is called sees the already-downcased strings. `map` (without `!`) allocates a fresh array and fills it with the transformed values, so `@tags` remains exactly as it was when passed to `initialize`. A related pitfall: even if you switched to `map`, calling `downcase!` on the strings inside the block would still mutate the original string objects if they are shared references — so prefer `downcase` (non-bang) inside the block as well.

---

### Issue 2: Callers Receive a Direct Reference to Internal State

**Problem:** With the original `map!` in place, `normalize_tags` returns `@tags` itself, so any caller that stores the return value holds a live reference to the formatter's internal array. Mutating that return value would alter `@tags` from outside the class.

**Fix:** Because `map` now returns a new array, the return value is already an independent object. The call site is updated to capture it in `normalized = formatter.normalize_tags`, making it explicit that the result is a separate value, not a pointer into the formatter's state.

**Explanation:** When `map!` was used, the method returned the same object as `@tags`. Any external code doing something like `tags = formatter.normalize_tags; tags.push('extra')` would silently alter the formatter's internal tag list. After switching to `map`, the returned array is a distinct object, so external modifications to it have no effect on `@tags`. This is a general principle for accessor-like methods on mutable collections: returning a copy (or a frozen copy) prevents callers from accidentally — or intentionally — reaching into an object's internals.
