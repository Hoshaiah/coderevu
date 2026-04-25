## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — transform_values! Returns Nil on Noop
# ------------------------------------------------------------------------

# lib/normalizers/metric_normalizer.rb
module Normalizers
  class MetricNormalizer
    def self.call(metrics)
      # CHANGE 1: Use `transform_values` (non-bang) instead of `transform_values!` so the method always returns the transformed hash rather than nil when no values changed, and avoids mutating the caller's object (CHANGE 2).
      stripped = metrics.transform_values do |v|
        v.is_a?(String) ? v.strip : v
      end

      stripped
    end
  end
end

# Example usage:
# MetricNormalizer.call({ cpu: 0.82, memory: 0.61 })  # => { cpu: 0.82, memory: 0.61 }  (fixed)
# MetricNormalizer.call({ host: "  web-01 ", cpu: 0.82 })  # => { host: "web-01", cpu: 0.82 }
```

## Explanation

### Issue 1: `transform_values!` Returns `nil` on No-Op

**Problem:** When every value in the hash is numeric (no strings), the block never changes any value. In that case, `transform_values!` considers the hash unmodified and returns `nil` instead of the hash. The variable `stripped` ends up holding `nil`, and the method propagates it downstream, causing the pipeline to drop those metric payloads.

**Fix:** Replace `transform_values!` with `transform_values` (the non-bang version) at the `CHANGE 1` site. The non-bang form always returns a new hash containing the block's results, regardless of whether any value actually changed.

**Explanation:** Ruby's convention for bang (`!`) methods is that they return `nil` when the operation is a no-op — that is, when nothing was modified. `Hash#transform_values!` follows this convention: if every block return value is equal to the original value, the hash is untouched and the method returns `nil`. With all-numeric metrics the block always returns the original number unchanged, so `transform_values!` reliably returns `nil` for those hashes. `transform_values` (no bang) never returns `nil`; it always allocates and returns a new hash built from the block's output. Switching to the non-bang form is the minimal fix.

---

### Issue 2: Mutating the Caller's Input Hash

**Problem:** `transform_values!` modifies the hash in-place. Any caller that passes a hash to `MetricNormalizer.call` will find their original hash mutated after the call returns. In a high-throughput streaming pipeline this can corrupt shared metric objects or lead to hard-to-trace data changes upstream.

**Fix:** The same `CHANGE 1` fix — switching to `transform_values` — also resolves this issue because `transform_values` returns a brand-new hash and leaves the original argument untouched.

**Explanation:** `transform_values!` writes the block's return values back into the existing hash object. If the caller holds a reference to the same object (for example, a ring-buffer or a metrics-builder object that reuses hashes), it will see its data changed without being told. `transform_values` creates a fresh hash, so the input reference stays stable. This also makes `MetricNormalizer.call` easier to reason about: it is now a pure function that maps input to output without side-effects on its argument.
