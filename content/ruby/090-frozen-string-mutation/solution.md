## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — String transformation raises FrozenError only in production
# ------------------------------------------------------------------------
# frozen_string_literal: true

module TextNormalizer
  def self.normalize(text)
    # CHANGE 1: dup the input so we work on a mutable copy rather than mutating the (potentially frozen) argument directly
    # CHANGE 2: use a local variable so the caller's string is never modified
    result = text.dup
    result.strip!
    result.gsub!(/\s+/, ' ')
    result.downcase!
    result
  end
end

puts TextNormalizer.normalize("  Hello   World  ")  # => "hello world"
```

## Explanation

### Issue 1: Bang methods mutate frozen string literals

**Problem:** When `# frozen_string_literal: true` is at the top of a file, every string literal in that file is frozen. Calling `strip!`, `gsub!`, or `downcase!` on a frozen string raises `FrozenError: can't modify frozen String`. This only surfaces in files that opt into frozen literals (e.g., every file in a Rails app configured with `config.frozen_string_literal = true`), so the bug is invisible in plain IRB or CLI scripts that lack the magic comment.

**Fix:** At `CHANGE 1`, the method calls `text.dup` immediately and assigns the result to a new local variable `result`. All three bang methods are then called on `result` instead of on `text`.

**Explanation:** `String#dup` always produces an unfrozen copy, even when the receiver is frozen. The bang variants (`strip!`, `gsub!`, `downcase!`) modify the string they are called on in place and return `nil` if no change was made — they require a mutable target. By calling them on the duplicated string, the method never touches a frozen object and the `FrozenError` disappears. Note that `String#clone` would preserve the frozen state of the original, so `dup` is the right choice here.

---

### Issue 2: In-place mutation of the caller's argument

**Problem:** Even when the string is not frozen (e.g., in the CLI), calling `strip!`, `gsub!`, and `downcase!` directly on `text` mutates the object the caller passed in. If the caller reuses that variable after calling `normalize`, it silently finds it already modified, which is a hard-to-trace side effect.

**Fix:** At `CHANGE 2`, the method operates on `result = text.dup` throughout, leaving the caller's original string untouched and returning the transformed copy.

**Explanation:** Ruby passes object references, not copies. When the argument is a mutable string, the bang methods change it in place through that reference. The caller's variable now points to the already-stripped, lowercased string without any indication that happened. Working on a `dup` makes `normalize` a pure transformation: it accepts input, returns output, and has no observable effect on its arguments. This also means the method can be safely called on string variables, constants, or any other string reference without surprising the rest of the program.
