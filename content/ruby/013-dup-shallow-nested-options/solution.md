## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Shallow Dup Leaks Nested Config
# ------------------------------------------------------------------------

module Report
  DEFAULTS = {
    format: :pdf,
    filters: { active: true, archived: false },
    page_size: 50
  # CHANGE 2: freeze the constant so any accidental direct mutation raises a FrozenError instead of silently corrupting shared state
  }.freeze

  def self.build_options(overrides = {})
    # CHANGE 1: use deep_dup pattern (Marshal round-trip) instead of shallow dup so nested hashes like :filters are independent copies, not shared references
    options = Marshal.load(Marshal.dump(DEFAULTS))
    options.merge!(overrides)
    options
  end
end

# Tenant A
opts_a = Report.build_options(tenant_id: 1)
opts_a[:filters][:region] = "eu"

# Tenant B — now correctly sees no :region key
opts_b = Report.build_options(tenant_id: 2)
puts opts_b[:filters].inspect
```

## Explanation

### Issue 1: Shallow Dup Shares Nested Hash

**Problem:** Every call to `build_options` returns an options hash whose `:filters` key points to the exact same Hash object that lives inside `DEFAULTS`. When Tenant A's job does `opts_a[:filters][:region] = "eu"`, it writes directly into that shared object, so every subsequent call to `build_options` — including Tenant B's — sees `:region => "eu"` in the filters.

**Fix:** Replace `DEFAULTS.dup` with `Marshal.load(Marshal.dump(DEFAULTS))`, a deep-copy idiom that recursively produces independent copies of all nested objects. This is the CHANGE 1 site.

**Explanation:** `Hash#dup` copies only the top-level hash. The values — including the `:filters` sub-hash — are not duplicated; the new hash holds the same object references as the original. So `options[:filters]` and `DEFAULTS[:filters]` are the same object in memory. Any write through one is immediately visible through the other. `Marshal.dump` serializes the entire object graph and `Marshal.load` deserializes it into a fresh graph with no shared references. A related pitfall: `Hash#merge` with a hash value in `overrides` has the same problem — if `overrides[:filters]` is a hash, `merge!` stores that exact object, so the caller still shares it; a deep copy at the top avoids this too.

---

### Issue 2: Mutable Constant Allows Silent Corruption

**Problem:** Because `DEFAULTS` is not frozen, any code anywhere in the process can mutate it directly — e.g. `Report::DEFAULTS[:filters][:region] = "eu"` — and Ruby raises no error. The corruption is permanent for the lifetime of the process and affects every subsequent caller.

**Fix:** Add `.freeze` at the end of the `DEFAULTS` hash literal. This is the CHANGE 2 site. Note that `freeze` is shallow too, so to fully protect nested objects you would normally call `freeze` on each nested hash as well; in this codebase the deep-copy fix in CHANGE 1 means callers never write back to `DEFAULTS` itself, so a single top-level `freeze` is sufficient to catch direct constant mutations.

**Explanation:** Ruby constants are not truly immutable by default; they are just conventionally uppercase. `freeze` marks the object so that any attempt to modify it raises a `FrozenError`, turning a silent data-corruption bug into an immediate, visible exception. Without the freeze, a typo or a careless `DEFAULTS.merge!(something)` call silently poisons the shared default for every future call in the process. With the freeze in place, the mistake is caught at the point of mutation rather than discovered later as mysterious cross-tenant data leakage.
